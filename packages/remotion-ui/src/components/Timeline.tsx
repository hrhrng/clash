import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  DragMoveEvent,
} from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { useEditor } from '@remotion-fast/core';
import type { Item } from '@remotion-fast/core';
import { TimelineHeader } from './timeline/TimelineHeader';
import { TimelineRuler } from './timeline/TimelineRuler';
import { TimelineTracksContainer } from './timeline/TimelineTracksContainer';
import { TimelinePlayhead } from './timeline/TimelinePlayhead';
import { TimelineItem } from './timeline/TimelineItem';
import { useKeyboardShortcuts } from './timeline/hooks/useKeyboardShortcuts';
import { colors, timeline as timelineStyles, typography } from './timeline/styles';
import { getPixelsPerFrame, pixelsToFrame, frameToPixels, secondsToFrames } from './timeline/utils/timeFormatter';
import { calculateSnap, calculateSnapForItemRange, getAllSnapTargets } from './timeline/utils/snapCalculator';
import { buildPreview as buildItemDragPreview, finalizeDrop as finalizeItemDrop, computeVerticalLandmarks } from './timeline/dnd/itemDragLogic';
import { currentDraggedAsset, currentAssetDragOffset } from './AssetPanel';

// 声明全局window属性
declare global {
  interface Window {
    currentDraggedItem: { item: Item; trackId: string } | null;
  }
}

export const Timeline: React.FC = () => {
  const { state, dispatch } = useEditor();
  const {
    tracks,
    selectedItemId,
    selectedTrackId,
    currentFrame,
    zoom,
    fps,
    durationInFrames,
    assets,
    playing,
  } = state;

  const [snapEnabled, setSnapEnabled] = useState(true);
  const [draggedItem, setDraggedItem] = useState<{ trackId: string; item: Item } | null>(null);
  const [dragOffset, setDragOffset] = useState<number>(0); // 鼠标相对于素材左边缘的偏移量（像素）
  const [assetDragOffset, setAssetDragOffset] = useState<number>(0); // asset 拖动时的偏移量
  const lastDragTopRef = useRef<number | null>(null);
  const previousContentEndRef = useRef<number>(0); // 记录上次的内容结束位置

  // 拖动预览状态：存储预期的落点位置（snap后的）
  const [dragPreview, setDragPreview] = useState<{
    itemId: string;
    item: Item;
    originalTrackId: string;
    originalFrom: number;
    previewTrackId: string;
    previewFrame: number;
    rawPreviewFrame?: number;
    // Snap visualization info
    snapEdge?: 'left' | 'right' | null;
    snapTargetType?: 'item-start' | 'item-end' | 'playhead' | 'track-start' | 'grid' | undefined | null;
    snapGuideFrame?: number | null; // vertical guide line frame (only for item-start/item-end)
  } | null>(null);
  const [insertPosition, setInsertPosition] = useState<number | null>(null);
  
  // Asset拖动预览状态（从AssetPanel拖入时的预览框）
  const [assetDragPreview, setAssetDragPreview] = useState<{
    item: Item;
    trackId: string;
    isTemporaryTrack: boolean;
    insertIndex?: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  // Mount point for labels (left column) when externalized from tracks container
  const labelsPortalRef = useRef<HTMLDivElement>(null);
  const [labelsPortalEl, setLabelsPortalEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    // Mount once so TracksContainer receives a stable portal target
    setLabelsPortalEl(labelsPortalRef.current);
  }, []);
  
  // Sync horizontal scroll position of tracks viewport with ruler and playhead
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportContentWidth, setViewportContentWidth] = useState(0);
  // Visual inset to shift right-pane content without changing layout
  const contentInsetLeftPx = 12;

  const pixelsPerFrame = getPixelsPerFrame(zoom);
  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 2 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor)
  );

  // dnd-kit: item drag start
  const onDndItemStart = useCallback((event: DragStartEvent) => {
    const data: any = event.active.data.current;
    if (!data || !data.item) return;
    const item = data.item as Item;
    const trackId = data.trackId as string;
    // eslint-disable-next-line no-console
    console.log('[DND] onDragStart', { id: item.id, trackId, rect: event.active.rect.current });

    setDraggedItem({ trackId, item });
    // Do not set window.currentDraggedItem for dnd-kit flow; keep it for native drag only

    const initialLeft = event.active.rect.current.initial?.left ?? 0;
    const activator = event.activatorEvent as PointerEvent | MouseEvent | null;
    const offsetX = activator && 'clientX' in activator ? activator.clientX - initialLeft : 0;
    setDragOffset(offsetX);

    const nextPreview = {
      itemId: item.id,
      item,
      originalTrackId: trackId,
      originalFrom: item.from,
      previewTrackId: trackId,
      previewFrame: item.from,
      rawPreviewFrame: item.from,
    };
    // eslint-disable-next-line no-console
    console.log('[DND] init preview', nextPreview);
    setDragPreview(nextPreview);
  }, []);

  // dnd-kit: item drag move/over -> update preview
  const updatePreviewFromDnd = (
    leftOnViewport: number,
    topOnViewport: number,
    heightPx: number
  ) => {
    if (!draggedItem || !dragPreview) return;

    const container = containerRef.current;
    const viewportEl = document.querySelector('.tracks-viewport') as HTMLDivElement | null;
    if (!container || !viewportEl) return;

    const containerRect = container.getBoundingClientRect();
    const viewportRect = viewportEl.getBoundingClientRect();
    const leftWithinTracks = leftOnViewport - containerRect.left - timelineStyles.trackLabelWidth - contentInsetLeftPx + viewportEl.scrollLeft;
    // Use DragOverlay position relative to viewport, then add scrollTop to get absolute position in content
    // (viewport position is visual, we need absolute position in the entire scrollable content)
    const topY = (topOnViewport - viewportRect.top) + viewportEl.scrollTop;

    const insertThresholdPx = Math.min(12, Math.floor(timelineStyles.trackHeight * 0.15));
    // Debug: log decision landmarks relative to source track boundaries
    const H = heightPx;
    const q1 = topY + H / 3;
    const q2 = topY + (2 * H) / 3;
    const srcIdx = Math.max(0, tracks.findIndex((t) => t.id === dragPreview.originalTrackId));
    const srcTop = srcIdx * timelineStyles.trackHeight;
    const srcBottom = (srcIdx + 1) * timelineStyles.trackHeight;
    // eslint-disable-next-line no-console
    console.log('[DND][landmarks]', {
      topY: Math.round(topY),
      q1: Math.round(q1),
      q2: Math.round(q2),
      srcTop: Math.round(srcTop),
      srcBottom: Math.round(srcBottom),
    });
    const preview = buildItemDragPreview({
      leftWithinTracksPx: leftWithinTracks,
      itemTopY: topY,
      itemHeightPx: heightPx,
      prevItemTopY: lastDragTopRef.current ?? undefined,
      pixelsPerFrame,
      tracks,
      item: draggedItem.item,
      originalTrackId: dragPreview.originalTrackId,
      currentFrame,
      snapEnabled: !!snapEnabled,
      trackHeight: timelineStyles.trackHeight,
      insertThresholdPx: insertThresholdPx,
    });

    setInsertPosition(preview.willCreateNewTrack ? preview.insertIndex : null);
    setDragPreview({
      ...dragPreview,
      previewTrackId: preview.previewTrackId,
      previewFrame: preview.previewFrame,
      rawPreviewFrame: preview.rawPreviewFrame,
      snapEdge: undefined,
      snapTargetType: undefined,
      snapGuideFrame: preview.snapGuideFrame,
    });
    lastDragTopRef.current = topY;
  };

  const onDndItemMove = useCallback((event: DragMoveEvent) => {
    const translated = event.active.rect.current.translated;
    const height = translated?.height || event.active.rect.current.initial?.height || 0;
    const left = translated?.left ?? ((event.active.rect.current.initial?.left || 0) + event.delta.x);
    const top = translated?.top ?? ((event.active.rect.current.initial?.top || 0) + event.delta.y);
    updatePreviewFromDnd(left, top, height);
  }, [updatePreviewFromDnd]);

  const onDndItemOver = useCallback((event: DragOverEvent) => {
    const translated = event.active.rect.current.translated;
    const height = translated?.height || event.active.rect.current.initial?.height || 0;
    const left = translated?.left ?? ((event.active.rect.current.initial?.left || 0) + (event.delta?.x || 0));
    const top = translated?.top ?? ((event.active.rect.current.initial?.top || 0) + (event.delta?.y || 0));
    updatePreviewFromDnd(left, top, height);
  }, [updatePreviewFromDnd]);

  // dnd-kit: item drag end -> commit move
  const onDndItemEnd = useCallback((event: DragEndEvent) => {
    if (!dragPreview) {
      setDraggedItem(null);
      setDragOffset(0);
      setDragPreview(null);
      window.currentDraggedItem = null;
      return;
    }

    const { item, originalTrackId } = dragPreview;
    // eslint-disable-next-line no-console
    console.log('[DND] onDragEnd', {
      itemId: item.id,
      fromTrack: originalTrackId,
      toTrack: dragPreview.previewTrackId,
      frame: dragPreview.previewFrame,
    });
    const drop = finalizeItemDrop(
      {
        previewTrackId: dragPreview.previewTrackId,
        previewFrame: dragPreview.previewFrame,
        rawPreviewFrame: dragPreview.rawPreviewFrame ?? dragPreview.previewFrame,
        insertIndex: insertPosition,
        willCreateNewTrack: insertPosition != null,
        snapGuideFrame: dragPreview.snapGuideFrame ?? null,
      },
      tracks,
      originalTrackId
    );
    
    console.log('[DND] Drop action:', drop.type, {
      originalTrackId,
      targetTrackId: 'targetTrackId' in drop ? drop.targetTrackId : 'N/A',
      frame: drop.frame,
      tracksCount: tracks.length,
      itemsInOriginal: tracks.find(t => t.id === originalTrackId)?.items.length,
      itemsInTarget: 'targetTrackId' in drop ? tracks.find(t => t.id === drop.targetTrackId)?.items.length : 'N/A',
    });

    if (drop.type === 'create-track') {
      const newTrack = {
        id: `track-${Date.now()}`,
        name: item.type.charAt(0).toUpperCase() + item.type.slice(1),
        items: [{ ...item, from: drop.frame }],
      };
      dispatch({ type: 'INSERT_TRACK', payload: { track: newTrack, index: drop.insertIndex } });
      dispatch({ type: 'REMOVE_ITEM', payload: { trackId: originalTrackId, itemId: item.id } });
    } else if (drop.type === 'move-within-track') {
      dispatch({
        type: 'UPDATE_ITEM',
        payload: { trackId: drop.targetTrackId, itemId: item.id, updates: { from: drop.frame } },
      });
    } else if (drop.type === 'move-to-track') {
      // 如果目标track和源track相同，当作同track移动处理
      if (drop.targetTrackId === originalTrackId) {
        dispatch({
          type: 'UPDATE_ITEM',
          payload: { trackId: drop.targetTrackId, itemId: item.id, updates: { from: drop.frame } },
        });
      } else {
        const updatedItem = { ...item, from: drop.frame };
        dispatch({ type: 'ADD_ITEM', payload: { trackId: drop.targetTrackId, item: updatedItem } });
        dispatch({ type: 'REMOVE_ITEM', payload: { trackId: originalTrackId, itemId: item.id } });
      }
    }

    dispatch({ type: 'SELECT_ITEM', payload: item.id });
    setDraggedItem(null);
    setDragOffset(0);
    setDragPreview(null);
    setInsertPosition(null);
    window.currentDraggedItem = null;
  }, [dragPreview, dispatch, insertPosition, tracks]);

  // Measure available content width (excluding the fixed track label gutter).
  // We use it to:
  // 1) prevent the empty timeline from scrolling horizontally;
  // 2) clamp the ruler/track min widths for a stable layout.
  useEffect(() => {
    const measure = () => {
      const el = workspaceRef.current ?? containerRef.current;
      if (!el) return;
      const width = el.getBoundingClientRect().width - timelineStyles.trackLabelWidth;
      setViewportContentWidth(Math.max(0, Math.floor(width)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Derive display length for UI (ruler + tracks)
  // Longest content end (in frames) across all tracks.
  // This is the authoritative bound for generating ticks/labels.
  const contentEndInFrames = useMemo(() => {
    // Longest item end frame
    let maxEnd = 0;
    for (const t of tracks) {
      for (const it of t.items) {
        const end = (it.from || 0) + (it.durationInFrames || 0);
        if (end > maxEnd) maxEnd = end;
      }
    }

    return maxEnd;
  }, [tracks]);

  // Final UI width in frames for ruler + tracks.
  // With items: extend to 1.3x of longest item for better UX headroom.
  // Without items: fill exactly the visible viewport width (no horizontal scroll).
  const displayDurationInFrames = useMemo(() => {
    const framesFromItems = contentEndInFrames > 0 ? Math.ceil(contentEndInFrames * 1.3) : 0;

    if (tracks.length === 0 || framesFromItems === 0) {
      if (viewportContentWidth <= 0) return durationInFrames; // fallback
      return Math.max(1, Math.floor(viewportContentWidth / getPixelsPerFrame(zoom)));
    }

    const neededPx = Math.max(
      frameToPixels(framesFromItems, getPixelsPerFrame(zoom)),
      viewportContentWidth
    );
    return Math.ceil(neededPx / getPixelsPerFrame(zoom));
  }, [tracks.length, contentEndInFrames, fps, zoom, viewportContentWidth, durationInFrames]);

  // no extra alignment

  // ==================== 缩放控制 ====================
  // Adaptive zoom step: use smaller increments at lower zoom levels for better control
  const getAdaptiveZoomStep = useCallback((currentZoom: number): number => {
    if (currentZoom < 0.5) return 0.1;
    if (currentZoom < 1) return 0.15;
    if (currentZoom < 2) return 0.25;
    if (currentZoom < 4) return 0.5;
    return 1;
  }, []);

  // Calculate zoom level needed to fit all content in viewport
  const calculateFitZoom = useCallback(() => {
    if (contentEndInFrames === 0 || viewportContentWidth === 0) return timelineStyles.zoomDefault;

    // Calculate pixels per frame needed to fit content in viewport
    const neededPixelsPerFrame = viewportContentWidth / (contentEndInFrames * 1.1); // 1.1x for padding
    // Convert to zoom multiplier (base is 2px per frame at zoom=1)
    const fitZoom = neededPixelsPerFrame / 2;

    // Clamp between min and max
    return Math.max(timelineStyles.zoomMin, Math.min(timelineStyles.zoomMax, fitZoom));
  }, [contentEndInFrames, viewportContentWidth]);

  // Smart zoom limits based on content
  const getSmartZoomLimits = useCallback(() => {
    if (contentEndInFrames === 0) {
      return { min: timelineStyles.zoomMin, max: timelineStyles.zoomMax };
    }

    // Calculate minimum zoom that prevents timeline from being too small
    const minPxWidth = 200; // minimum timeline width
    const minZoom = Math.max(timelineStyles.zoomMin, minPxWidth / (contentEndInFrames * 2));

    // Calculate maximum zoom that prevents excessive horizontal scrolling
    const maxFramesVisible = 300; // reasonable viewport size in frames
    const maxZoom = Math.min(timelineStyles.zoomMax, (viewportContentWidth / maxFramesVisible) / 2);

    return {
      min: Math.max(timelineStyles.zoomMin, minZoom),
      max: Math.max(minZoom, maxZoom)
    };
  }, [contentEndInFrames, viewportContentWidth]);

  const handleZoomIn = useCallback(() => {
    const limits = getSmartZoomLimits();
    const step = getAdaptiveZoomStep(zoom);
    if (zoom < limits.max) {
      const newZoom = Math.min(zoom + step, limits.max);
      dispatch({ type: 'SET_ZOOM', payload: newZoom });
    }
  }, [zoom, dispatch, getSmartZoomLimits, getAdaptiveZoomStep]);

  const handleZoomOut = useCallback(() => {
    const limits = getSmartZoomLimits();
    const step = getAdaptiveZoomStep(zoom);
    if (zoom > limits.min) {
      const newZoom = Math.max(zoom - step, limits.min);
      dispatch({ type: 'SET_ZOOM', payload: newZoom });
    }
  }, [zoom, dispatch, getSmartZoomLimits, getAdaptiveZoomStep]);

  // Zoom to fit all content
  const handleZoomToFit = useCallback(() => {
    const fitZoom = calculateFitZoom();
    dispatch({ type: 'SET_ZOOM', payload: fitZoom });
  }, [dispatch, calculateFitZoom]);

  // Reset zoom to default
  const handleZoomReset = useCallback(() => {
    dispatch({ type: 'SET_ZOOM', payload: timelineStyles.zoomDefault });
  }, [dispatch]);

  // Handle zoom change from slider
  const handleZoomChange = useCallback((newZoom: number) => {
    dispatch({ type: 'SET_ZOOM', payload: newZoom });
  }, [dispatch]);

  // ==================== 播放头控制 ====================
  const handleSeek = useCallback(
    (frame: number) => {
      dispatch({ type: 'SET_CURRENT_FRAME', payload: Math.max(0, Math.min(frame, durationInFrames)) });
    },
    [dispatch, durationInFrames]
  );

  // ==================== 轨道操作 ====================
  const handleAddTrack = useCallback(() => {
    const newTrack = {
      id: `track-${Date.now()}`,
      name: 'Track',
      items: [],
    };
    dispatch({ type: 'ADD_TRACK', payload: newTrack });
  }, [dispatch]);

  const handleSelectTrack = useCallback(
    (trackId: string) => {
      dispatch({ type: 'SELECT_TRACK', payload: trackId });
      dispatch({ type: 'SELECT_ITEM', payload: null });
    },
    [dispatch]
  );

  // ==================== 素材项操作 ====================
  const handleSelectItem = useCallback(
    (itemId: string) => {
      dispatch({ type: 'SELECT_ITEM', payload: itemId });
    },
    [dispatch]
  );

  const handleDeleteItem = useCallback(
    (trackId: string, itemId: string) => {
      dispatch({
        type: 'REMOVE_ITEM',
        payload: { trackId, itemId },
      });
    },
    [dispatch]
  );

  const handleUpdateItem = useCallback(
    (trackId: string, itemId: string, updates: Partial<Item>) => {
      dispatch({
        type: 'UPDATE_ITEM',
        payload: { trackId, itemId, updates },
      });
    },
    [dispatch]
  );

  // ==================== Item拖动处理 ====================
  const handleItemDragStart = useCallback((e: React.DragEvent, trackId: string, item: Item) => {

    // 同时设置本地state和全局window对象（兼容TimelineTracksContainer的insertDrop）
    setDraggedItem({ trackId, item });
    window.currentDraggedItem = { trackId, item };

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('dragType', 'item');
    e.dataTransfer.setData('itemId', item.id);
    e.dataTransfer.setData('trackId', trackId);

    // 创建一个透明的拖动图像（隐藏默认的地球图标）
    const dragImage = document.createElement('div');
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    dragImage.style.width = '1px';
    dragImage.style.height = '1px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);

    // 拖动结束后清理
    setTimeout(() => {
      document.body.removeChild(dragImage);
    }, 0);

    // 计算鼠标相对于素材左边缘的偏移量
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    setDragOffset(offsetX);

    // 初始化拖动预览状态
    setDragPreview({
      itemId: item.id,
      item: item,
      originalTrackId: trackId,
      originalFrom: item.from,
      previewTrackId: trackId,
      previewFrame: item.from,
    });

  }, []);

  // ==================== 拖放处理（从 AssetPanel 拖入素材 + Timeline内移动）====================
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';

    // 如果是拖动已有item，不处理（由dnd-kit处理）
    if (draggedItem) {
      if (assetDragPreview) setAssetDragPreview(null);
      return;
    }

    // 检查是否是从AssetPanel拖入的asset
    // 注意：某些浏览器在dragOver中无法访问dataTransfer数据
    // 所以我们需要依赖AssetPanel中设置的全局变量
    const assetId = e.dataTransfer.getData('assetId');
    const isQuickAdd = e.dataTransfer.getData('quickAdd') === 'true';
    const quickAddType = e.dataTransfer.getData('quickAddType');

    // 使用导入的 currentDraggedAsset
    const draggedAsset = currentDraggedAsset;

    console.log('[Timeline.handleDragOver] Drag data:', {
      assetId,
      isQuickAdd,
      quickAddType,
      draggedAsset,
      currentDraggedAssetFromImport: currentDraggedAsset,
      hasDraggedItem: !!draggedItem,
      dataTransferTypes: Array.from(e.dataTransfer.types),
    });

    if (!assetId && !isQuickAdd && !draggedAsset) {
      console.log('[Timeline.handleDragOver] No asset data, clearing preview');
      if (assetDragPreview) setAssetDragPreview(null);
      return;
    }
    
    // 计算鼠标位置和目标位置
    const viewportEl = document.querySelector('.tracks-viewport') as HTMLDivElement | null;
    if (!viewportEl) return;

    const rect = viewportEl.getBoundingClientRect();
    // 计算鼠标相对于 viewport 的位置
    const mouseX = e.clientX - rect.left + viewportEl.scrollLeft - contentInsetLeftPx;
    const y = e.clientY - rect.top + viewportEl.scrollTop;

    // 计算 asset 左边缘的位置（减去拖动偏移量）
    const assetLeftX = mouseX - currentAssetDragOffset;
    const rawFrame = Math.max(0, Math.round(assetLeftX / pixelsPerFrame));
    const snapResult = calculateSnap(rawFrame, tracks, null, currentFrame, snapEnabled, timelineStyles.snapThreshold);
    const frame = Math.max(0, snapResult.snappedFrame);

    console.log('[Timeline.handleDragOver] Position calc:', {
      mouseX: e.clientX,
      rectLeft: rect.left,
      scrollLeft: viewportEl.scrollLeft,
      contentInsetLeftPx,
      currentAssetDragOffset,
      mouseXInViewport: mouseX,
      assetLeftX,
      rawFrame,
      frame,
      pixelsPerFrame,
    });
    
    const trackIndex = Math.floor(y / timelineStyles.trackHeight);
    const relativeY = y % timelineStyles.trackHeight;
    const threshold = 20;

    let targetTrackId: string | null = null;
    let insertIdx: number | null = null;

    // 与 item 拖动逻辑保持一致：检测是否在轨道边界附近（要插入新 track）
    if (tracks.length > 0 && (relativeY < threshold || relativeY > timelineStyles.trackHeight - threshold)) {
      // 在轨道边界附近 - 准备插入新 track
      insertIdx = relativeY < threshold ? trackIndex : trackIndex + 1;
      if (insertIdx >= 0 && insertIdx <= tracks.length) {
        // 设置 insertPosition，清除预览框（与 item 拖动一致）
        setInsertPosition(insertIdx);
        if (assetDragPreview) setAssetDragPreview(null);
        return;
      }
    } else if (trackIndex >= 0 && trackIndex < tracks.length) {
      // 在现有轨道上 - 显示预览框
      targetTrackId = tracks[trackIndex].id;
    } else if (tracks.length === 0) {
      // 空时间轴 - 准备创建第一个 track
      insertIdx = 0;
      setInsertPosition(insertIdx);
      if (assetDragPreview) setAssetDragPreview(null);
      return;
    }

    if (!targetTrackId) {
      if (assetDragPreview) setAssetDragPreview(null);
      setInsertPosition(null);
      return;
    }

    // 清除插入位置（因为现在是在现有 track 上）
    setInsertPosition(null);
    
    // 创建预览item（包含完整信息以正确计算高度）
    let duration = 90; // 默认duration
    let itemType: any = 'video';
    let previewItem: Item;

    if (!isQuickAdd) {
      // 优先使用全局draggedAsset，其次尝试从assets中查找
      const asset = draggedAsset || assets.find(a => a.id === assetId);
      if (asset) {
        itemType = asset.type;
        if (asset.duration) {
          duration = secondsToFrames(asset.duration, fps);
        }

        // 根据类型创建包含完整属性的预览item
        if (asset.type === 'video') {
          previewItem = {
            id: `preview-${Date.now()}`,
            type: 'video',
            from: frame,
            durationInFrames: duration,
            src: asset.src,
            waveform: asset.waveform,
          } as Item;
        } else if (asset.type === 'audio') {
          previewItem = {
            id: `preview-${Date.now()}`,
            type: 'audio',
            from: frame,
            durationInFrames: duration,
            src: asset.src,
            waveform: asset.waveform,
          } as Item;
        } else if (asset.type === 'image') {
          previewItem = {
            id: `preview-${Date.now()}`,
            type: 'image',
            from: frame,
            durationInFrames: duration,
            src: asset.src,
          } as Item;
        } else {
          previewItem = {
            id: `preview-${Date.now()}`,
            type: itemType,
            from: frame,
            durationInFrames: duration,
          } as Item;
        }
      } else {
        previewItem = {
          id: `preview-${Date.now()}`,
          type: itemType,
          from: frame,
          durationInFrames: duration,
        } as Item;
      }
    } else {
      itemType = quickAddType;
      if (quickAddType === 'solid') {
        duration = 60;
      }
      previewItem = {
        id: `preview-${Date.now()}`,
        type: itemType,
        from: frame,
        durationInFrames: duration,
      } as Item;
    }
    
    console.log('[Timeline.handleDragOver] Setting asset drag preview:', {
      previewItem,
      targetTrackId,
      frame,
    });

    setAssetDragPreview({
      item: previewItem,
      trackId: targetTrackId,
      isTemporaryTrack: false, // 始终为 false，与 item 拖动逻辑一致
      insertIndex: undefined,
    });
  }, [draggedItem, assets, tracks, currentFrame, snapEnabled, pixelsPerFrame, fps, assetDragPreview]);

  // 创建素材项的辅助函数
  const createItemFromAsset = useCallback((asset: any, frame: number): Item | null => {
    const baseId = `item-${Date.now()}`;
    
    // 默认变换属性：画布中心 (0, 0)、全尺寸
    const defaultProperties = {
      x: 0,          // 中心X (像素，相对于画布中心)
      y: 0,          // 中心Y (像素，相对于画布中心)
      width: 1,      // 全宽 (0-1)
      height: 1,     // 全高 (0-1)
      rotation: 0,   // 无旋转
      opacity: 1,    // 完全不透明
    };

    switch (asset.type) {
      case 'video':
        return {
          id: baseId,
          type: 'video' as const,
          from: frame,
          // asset.duration is seconds; convert to frames using current fps (with overhang clamp)
          durationInFrames: asset.duration ? secondsToFrames(asset.duration, fps) : 90,
          src: asset.src,
          sourceStartInFrames: 0,
          waveform: asset.waveform,
          properties: defaultProperties,
        } as Item;
      case 'audio':
        return {
          id: baseId,
          type: 'audio' as const,
          from: frame,
          durationInFrames: asset.duration ? secondsToFrames(asset.duration, fps) : 90,
          src: asset.src,
          sourceStartInFrames: 0,
          waveform: asset.waveform,
          properties: defaultProperties,
        } as Item;
      case 'image':
        return {
          id: baseId,
          type: 'image' as const,
          from: frame,
          durationInFrames: 90,
          src: asset.src,
          properties: defaultProperties,
        } as Item;
      default:
        return null;
    }
  }, []);

  // 处理拖放到空白时间轴区域（自动创建轨道）
  const handleTimelineDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();

      const isQuickAdd = e.dataTransfer.getData('quickAdd') === 'true';
      const quickAddType = e.dataTransfer.getData('quickAddType');
      const assetId = e.dataTransfer.getData('assetId');


      // 如果没有轨道，先创建一个
      if (tracks.length === 0) {
        const itemType = isQuickAdd ? quickAddType :
                        (assets.find(a => a.id === assetId)?.type || 'Track');
        const newTrack = {
          id: `track-${Date.now()}`,
          name: itemType.charAt(0).toUpperCase() + itemType.slice(1),
          items: [],
        };
        dispatch({ type: 'ADD_TRACK', payload: newTrack });

        // 然后添加素材到新轨道
        setTimeout(() => {
          let newItem: Item | null = null;

          if (isQuickAdd) {
            // Handle quick add items
            const defaultProperties = {
              x: 0,
              y: 0,
              width: 1,
              height: 1,
              rotation: 0,
              opacity: 1,
            };
            
            if (quickAddType === 'text') {
              newItem = {
                id: `text-${Date.now()}`,
                type: 'text',
                text: 'Double click to edit',
                color: '#000000',
                from: 0,
                durationInFrames: 90,
                fontSize: 60,
                properties: defaultProperties,
              } as Item;
            } else if (quickAddType === 'solid') {
              newItem = {
                id: `solid-${Date.now()}`,
                type: 'solid',
                color: '#' + Math.floor(Math.random() * 16777215).toString(16),
                from: 0,
                durationInFrames: 60,
                properties: defaultProperties,
              } as Item;
            }
          } else {
            // Handle regular assets
            const asset = assets.find((a) => a.id === assetId);
            if (!asset) {
              return;
            }
            newItem = createItemFromAsset(asset, 0);
          }

          if (newItem) {
            dispatch({
              type: 'ADD_ITEM',
              payload: { trackId: newTrack.id, item: newItem },
            });
            dispatch({ type: 'SELECT_ITEM', payload: newItem.id });
          }
          
          // 清除asset预览
          setAssetDragPreview(null);
          setInsertPosition(null);
        }, 0);
      }
    },
    [assets, tracks, dispatch, createItemFromAsset]
  );

  // 处理item在轨道上拖动（只更新预览，不修改真实state）
  const handleItemDragOver = useCallback(
    (e: React.DragEvent, trackId: string) => {
      e.preventDefault();
      e.stopPropagation();

      if (!draggedItem || !dragPreview) {
        return;
      }

      if (!containerRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - timelineStyles.trackLabelWidth - contentInsetLeftPx;

      // 预览框左边缘位置 = 鼠标位置 - 拖动偏移量
      const previewLeftX = mouseX - dragOffset;
      const rawFrame = Math.max(0, Math.floor(previewLeftX / pixelsPerFrame));

      // 计算吸附 - Shift键禁用吸附
      const disableSnap = e.shiftKey || !snapEnabled;
      // 拖动物料时，优先让左/右边缘都可吸附，选择移动量更小的方案
      const snapResult = calculateSnapForItemRange(
        rawFrame,
        draggedItem.item.durationInFrames,
        tracks,
        draggedItem.item.id,
        currentFrame,
        !disableSnap,
        timelineStyles.snapThreshold
      );

      // 只更新预览状态，不修改真实的state
      setDragPreview({
        ...dragPreview,
        previewTrackId: trackId,
        previewFrame: snapResult.snappedFrame,
      });
    },
    [draggedItem, dragPreview, dragOffset, pixelsPerFrame, tracks, currentFrame, snapEnabled]
  );

  // 处理item拖动松手（真正更新位置）
  const handleItemDrop = useCallback((e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!dragPreview) {
      return;
    }

    // 如果位置或轨道发生了变化，才需要更新
    const positionChanged = dragPreview.previewFrame !== dragPreview.originalFrom;
    const trackChanged = dragPreview.previewTrackId !== dragPreview.originalTrackId;

    if (trackChanged) {
      // 跨轨道移动：先添加到新轨道，再从旧轨道删除
      dispatch({
        type: 'ADD_ITEM',
        payload: {
          trackId: dragPreview.previewTrackId,
          item: { ...dragPreview.item, from: dragPreview.previewFrame },
        },
      });
      dispatch({
        type: 'REMOVE_ITEM',
        payload: {
          trackId: dragPreview.originalTrackId,
          itemId: dragPreview.itemId,
        },
      });
    } else if (positionChanged) {
      // 同轨道内移动：只更新位置
      dispatch({
        type: 'UPDATE_ITEM',
        payload: {
          trackId: dragPreview.originalTrackId,
          itemId: dragPreview.itemId,
          updates: { from: dragPreview.previewFrame },
        },
      });
    }

    // 清除拖动状态
    setDraggedItem(null);
    setDragOffset(0);
    setDragPreview(null);
    window.currentDraggedItem = null;
  }, [dragPreview, dispatch]);

  const handleItemDragEnd = useCallback(() => {
    setDraggedItem(null);
    setDragOffset(0);
    setDragPreview(null);
    setAssetDragPreview(null);
    setInsertPosition(null);
    window.currentDraggedItem = null;
  }, []);

  const handleDrop = useCallback(
    (trackId: string, e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // 如果是拖动已有item，dragEnd会清理状态
      if (draggedItem) {
        return;
      }

      // ========== 处理从AssetPanel拖入新素材 ==========
      const isQuickAdd = e.dataTransfer.getData('quickAdd') === 'true';
      const quickAddType = e.dataTransfer.getData('quickAddType');
      const assetId = e.dataTransfer.getData('assetId');


      // 计算放置位置（与 handleDragOver 逻辑保持一致）
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      // 减去 asset 拖动偏移量，使 drop 位置与预览位置一致
      const assetLeftX = mouseX - currentAssetDragOffset;
      const rawFrame = pixelsToFrame(assetLeftX, pixelsPerFrame);

      console.log('[Timeline.handleDrop] Drop position calc:', {
        mouseX: e.clientX,
        rectLeft: rect.left,
        currentAssetDragOffset,
        mouseXRelative: mouseX,
        assetLeftX,
        rawFrame,
        pixelsPerFrame,
      });

      // 应用吸附
      const snapResult = calculateSnap(
        rawFrame,
        tracks,
        null,
        currentFrame,
        snapEnabled,
        timelineStyles.snapThreshold
      );

      const frame = Math.max(0, snapResult.snappedFrame);

      console.log('[Timeline.handleDrop] Final position:', {
        rawFrame,
        snappedFrame: frame,
        trackId,
      });

      let newItem: Item | null = null;

      if (isQuickAdd) {
        // Handle quick add items
        const defaultProperties = {
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          rotation: 0,
          opacity: 1,
        };
        
        if (quickAddType === 'text') {
          newItem = {
            id: `text-${Date.now()}`,
            type: 'text',
            text: 'Double click to edit',
            color: '#ffffff',
            from: frame,
            durationInFrames: 90,
            fontSize: 60,
            properties: defaultProperties,
          } as Item;
        } else if (quickAddType === 'solid') {
          newItem = {
            id: `solid-${Date.now()}`,
            type: 'solid',
            color: '#' + Math.floor(Math.random() * 16777215).toString(16),
            from: frame,
            durationInFrames: 60,
            properties: defaultProperties,
          } as Item;
        }
      } else {
        // Handle regular assets
        const asset = assets.find((a) => a.id === assetId);
        if (!asset) {
          return;
        }
        newItem = createItemFromAsset(asset, frame);
      }

      if (!newItem) return;

      dispatch({
        type: 'ADD_ITEM',
        payload: { trackId, item: newItem },
      });

      // 选中新添加的素材
      dispatch({ type: 'SELECT_ITEM', payload: newItem.id });
      
      // 清除asset预览
      setAssetDragPreview(null);
      setInsertPosition(null);
    },
    [draggedItem, assets, tracks, currentFrame, snapEnabled, pixelsPerFrame, dispatch, createItemFromAsset]
  );

  // ==================== 键盘快捷键 ====================
  useKeyboardShortcuts(
    {
      onDelete: () => {
        if (selectedItemId) {
          // 找到包含该素材的轨道
          const track = tracks.find((t) => t.items.some((i) => i.id === selectedItemId));
          if (track) {
            handleDeleteItem(track.id, selectedItemId);
          }
        }
      },
      onPlayPause: () => {
        dispatch({ type: 'SET_PLAYING', payload: !playing });
      },
      onFrameForward: (frames) => {
        handleSeek(currentFrame + frames);
      },
      onFrameBackward: (frames) => {
        handleSeek(currentFrame - frames);
      },
      onZoomIn: handleZoomIn,
      onZoomOut: handleZoomOut,
      // Reserved shortcuts (no-op for now to avoid console noise in production)
      onCopy: () => {},
      onPaste: () => {},
      onDuplicate: () => {},
      onUndo: () => {},
      onRedo: () => {},
    },
    true
  );

  return (
    <div
      ref={containerRef}
      data-timeline-container
      onDragEnd={() => {
        setAssetDragPreview(null);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) {
          setAssetDragPreview(null);
        }
      }}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: colors.bg.primary,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* 头部工具栏 - 固定高度 */}
      <TimelineHeader
        currentFrame={currentFrame}
        fps={fps}
        zoom={zoom}
        snapEnabled={snapEnabled}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomToFit={handleZoomToFit}
        onZoomReset={handleZoomReset}
        onToggleSnap={() => setSnapEnabled(!snapEnabled)}
        onZoomChange={handleZoomChange}
        zoomLimits={getSmartZoomLimits()}
      />

      {/* 工作区域：两列布局（左：标签列；右：标尺+轨道） */}
      <div
        className="timeline-workspace"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
          position: 'relative',
        }}
        ref={workspaceRef}
      >
        {/* 左列：上方标尺占位 + 下方标签列表（通过 Portal 注入）*/}
        <div
          style={{
            width: timelineStyles.trackLabelWidth,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRight: `1px solid ${colors.border.default}`,
            background: colors.bg.secondary,
          }}
        >
          {/* 左侧 ruler 顶部占位 */}
          <div
            style={{
              height: timelineStyles.rulerHeight,
              flexShrink: 0,
              position: 'sticky',
              top: 0,
              zIndex: 30,
              background: `linear-gradient(180deg, ${colors.bg.secondary} 0%, ${colors.bg.elevated} 100%)`,
              borderBottom: `1px solid ${colors.border.default}`,
            }}
          />
          {/* 标签面板挂载点 */}
          <div ref={labelsPortalRef} style={{ flex: 1, minHeight: 0 }} />
        </div>

        {/* 右列：上方标尺 + 下方轨道视口 */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            position: 'relative',
            overflow: 'hidden', // clip playhead/ruler overflow to right column
          }}
          data-playhead-container
        >
          {/* 标尺 */}
          <div
            style={{
              height: timelineStyles.rulerHeight,
              flexShrink: 0,
              position: 'sticky',
              top: 0,
              zIndex: 15,
              background: `linear-gradient(180deg, ${colors.bg.secondary} 0%, ${colors.bg.elevated} 100%)`,
              overflow: 'hidden',
            }}
          >
            <TimelineRuler
              durationInFrames={displayDurationInFrames}
              pixelsPerFrame={pixelsPerFrame}
              fps={fps}
              onSeek={handleSeek}
              zoom={zoom}
              scrollLeft={scrollLeft}
              viewportWidth={viewportContentWidth}
              leftOffset={contentInsetLeftPx}
            />
          </div>

          {/* 轨道容器 - dnd-kit 包裹，仅用于 item 移动；资产拖入仍走原生 */}
          <DndContext
            sensors={sensors}
            modifiers={[restrictToWindowEdges]}
            onDragStart={onDndItemStart}
            onDragMove={onDndItemMove}
            onDragOver={onDndItemOver}
            onDragEnd={onDndItemEnd}
            autoScroll={{
              enabled: true,
              threshold: { x: 0.2, y: 0.2 },
              acceleration: 10,
            }}
          >
            <TimelineTracksContainer
              durationInFrames={displayDurationInFrames}
              pixelsPerFrame={pixelsPerFrame}
              fps={fps}
              snapEnabled={snapEnabled}
              selectedTrackId={selectedTrackId}
              selectedItemId={selectedItemId}
              assets={assets}
              onSelectTrack={handleSelectTrack}
              onSelectItem={handleSelectItem}
              onDeleteItem={handleDeleteItem}
              onUpdateItem={handleUpdateItem}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onEmptyDrop={handleTimelineDrop}
              // 关闭原生 item 拖拽通道
              onItemDragStart={() => {}}
              onItemDragOver={() => {}}
              onItemDrop={() => {}}
              onItemDragEnd={handleItemDragEnd}
              dragPreview={dragPreview}
              assetDragPreview={assetDragPreview}
              onScrollXChange={setScrollLeft}
              viewportWidth={viewportContentWidth}
              labelsPortal={labelsPortalEl}
              contentInsetLeftPx={contentInsetLeftPx}
              externalInsertPosition={insertPosition}
            />
            
            <DragOverlay dropAnimation={null}>
              {draggedItem ? (
                <TimelineItem
                  item={draggedItem.item}
                  trackId={draggedItem.trackId}
                  track={tracks.find(t => t.id === draggedItem.trackId) || tracks[0]}
                  pixelsPerFrame={pixelsPerFrame}
                  isSelected={false}
                  assets={assets}
                  onSelect={() => {}}
                  onDelete={() => {}}
                  onUpdate={() => {}}
                  isDragOverlay={true}
                  style={{
                    cursor: 'grabbing',
                    opacity: 0.95,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}
                />
              ) : null}
            </DragOverlay>
          </DndContext>

          {/* 播放头 - 仅覆盖右侧 */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: 'none',
              zIndex: 20,
            }}
          >
            <TimelinePlayhead
              currentFrame={currentFrame}
              pixelsPerFrame={pixelsPerFrame}
              fps={fps}
              timelineHeight={tracks.length * timelineStyles.trackHeight + timelineStyles.rulerHeight}
              onSeek={handleSeek}
              scrollLeft={scrollLeft}
              leftOffset={contentInsetLeftPx}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
