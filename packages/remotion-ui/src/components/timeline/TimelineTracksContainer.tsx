import React, { useState, useRef, useEffect, useCallback, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { useEditor } from '@remotion-fast/core';
import type { Track, Asset, Item } from '@remotion-fast/core';
import { colors, timeline, spacing, shadows, getItemColor, withOpacity, borderRadius } from './styles';
import { secondsToFrames } from './utils/timeFormatter';
import { TimelineItem } from './TimelineItem';
import { currentDraggedAsset, currentAssetDragOffset } from '../AssetPanel';
import { calculateResizeSnap } from './utils/snapCalculator';

// Declare the global window property for TypeScript
declare global {
  interface Window {
    currentDraggedItem: { item: Item; trackId: string } | null;
  }
}

// Tracks viewport + labels with drag/drop and scroll syncing.
// Notes:
// - `onScrollXChange` keeps ruler and playhead horizontally aligned with tracks.
// - `viewportWidth` prevents empty timeline from scrolling and keeps ruler/track widths stable.
interface TimelineTracksContainerProps {
  durationInFrames: number;
  pixelsPerFrame: number;
  fps: number;
  snapEnabled?: boolean;
  selectedTrackId: string | null;
  selectedItemId: string | null;
  assets: Asset[];
  onSelectTrack: (trackId: string) => void;
  onSelectItem: (itemId: string) => void;
  onDeleteItem: (trackId: string, itemId: string) => void;
  onUpdateItem: (trackId: string, itemId: string, updates: Partial<Item>) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (trackId: string, e: React.DragEvent) => void;
  onEmptyDrop: (e: React.DragEvent) => void;
  onItemDragStart: (e: React.DragEvent, trackId: string, item: Item) => void;
  onItemDragOver: (e: React.DragEvent, trackId: string) => void;
  onItemDrop: (e: React.DragEvent, trackId: string) => void;
  onItemDragEnd: () => void;
  dragPreview: {
    itemId: string;
    item: Item;
    originalTrackId: string;
    originalFrom: number;
    previewTrackId: string;
    previewFrame: number;
    // Optional raw snapped frame before any collision push; used when creating new tracks
    rawPreviewFrame?: number;
    // Snap visualization
    snapEdge?: 'left' | 'right' | null;
    snapTargetType?: 'item-start' | 'item-end' | 'playhead' | 'track-start' | 'grid' | undefined | null;
    snapGuideFrame?: number | null;
  } | null;
  // Asset drag preview from AssetPanel
  assetDragPreview?: {
    item: Item;
    trackId: string;
    isTemporaryTrack: boolean;
    insertIndex?: number;
  } | null;
  // Horizontal scroll sync – report viewport scrollLeft to parent
  onScrollXChange?: (scrollLeft: number) => void;
  // Available viewport content width (without labels), used to clamp min width
  viewportWidth?: number;
  // If provided, render labels panel into this element via portal
  labelsPortal?: HTMLElement | null;
  // Visual left inset for right content (px). Applied as padding on the tracks viewport.
  contentInsetLeftPx?: number;
  // External insert position (for dnd-kit drags). If provided, overrides internal detection
  externalInsertPosition?: number | null;
}

// Store dragged data globally to work around dataTransfer issues
let globalDragData: { assetId?: string; quickAdd?: string; quickAddType?: string; asset?: string } = {};

export const TimelineTracksContainer: React.FC<TimelineTracksContainerProps> = ({
  durationInFrames,
  pixelsPerFrame,
  fps,
  snapEnabled = true,
  selectedTrackId,
  selectedItemId,
  assets,
  onSelectTrack,
  onSelectItem,
  onDeleteItem,
  onUpdateItem,
  onDragOver,
  onDrop,
  onEmptyDrop,
  onItemDragStart,
  onItemDragOver,
  onItemDrop,
  onItemDragEnd,
  dragPreview,
  assetDragPreview,
  onScrollXChange,
  viewportWidth,
  labelsPortal,
  contentInsetLeftPx,
  externalInsertPosition,
}) => {
  const { state, dispatch } = useEditor();
  const { tracks } = state;

  // Track which item is being hovered for roll edit highlighting
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

  // Debug: log when assetDragPreview changes
  useEffect(() => {
    console.log('[TimelineTracksContainer] assetDragPreview updated:', assetDragPreview);
  }, [assetDragPreview]);

  // 不再需要临时 track，与 item 拖动逻辑一致
  const displayTracks = tracks;

  const containerRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const handleInsertDropRef = useRef<((e: React.DragEvent, position: number) => void) | null>(null);

  const [scrollSync, setScrollSync] = useState({ x: 0, y: 0 });
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [insertPosition, setInsertPosition] = useState<number | null>(null);
  // Show insert guideline only while a drag is actually active
  const hasDndKitDrag = !!dragPreview || !!window.currentDraggedItem;
  const effectiveInsertPosition = (isDraggingOver || hasDndKitDrag)
    ? (externalInsertPosition ?? insertPosition)
    : null;
  // Keep the track labels vertically aligned with tracks when a horizontal
  // scrollbar appears in the tracks viewport (e.g. on Windows where scrollbars take space).
  // We measure the horizontal scrollbar height and add equivalent bottom padding to the
  // left labels panel so both columns end at the same visual baseline.
  const [hScrollbar, setHScrollbar] = useState(0);

  const measureScrollbars = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    // Horizontal scrollbar thickness (height) = offsetHeight - clientHeight
    const horiz = Math.max(0, vp.offsetHeight - vp.clientHeight);
    // Only update when changed to avoid re-renders while scrolling
    setHScrollbar((prev) => (prev !== horiz ? horiz : prev));
  }, []);

  // Compute preview item height to match actual item render sizing
  const getPreviewItemHeight = useCallback((item: Item): number => {
    // Waveform items (audio/video with waveform) are taller
    const hasWaveform = (item.type === 'audio' || item.type === 'video') && (item as any).waveform;
    // Video with waveform + thumbnail is slightly taller in actual renderer
    let hasVideoWithThumbnail = false;
    if (item.type === 'video' && hasWaveform && 'src' in item) {
      const asset = assets.find((a) => a.src === (item as any).src);
      hasVideoWithThumbnail = !!asset?.thumbnail;
    }
    if (hasVideoWithThumbnail) return 60;
    if (hasWaveform) return 56;
    return 44;
  }, [assets]);

  // 同步垂直滚动（标签面板 ↔ 轨道视口）
  // Sync vertical scroll between labels and tracks; report horizontal scroll to parent.
  const handleViewportScroll = useCallback(() => {
    if (viewportRef.current && labelsRef.current) {
      const scrollTop = viewportRef.current.scrollTop;
      labelsRef.current.scrollTop = scrollTop;
      setScrollSync(prev => ({ ...prev, y: scrollTop }));

      // Sync horizontal scroll to consumers (ruler, playhead, etc.)
      const scrollLeft = viewportRef.current.scrollLeft;
      setScrollSync(prev => ({ ...prev, x: scrollLeft }));
      onScrollXChange?.(scrollLeft);
      // Re-measure in case scrollbar visibility changed while scrolling
      measureScrollbars();
    }
  }, [onScrollXChange, measureScrollbars]);

  const handleLabelsScroll = useCallback(() => {
    if (labelsRef.current && viewportRef.current) {
      const scrollTop = labelsRef.current.scrollTop;
      viewportRef.current.scrollTop = scrollTop;
      setScrollSync(prev => ({ ...prev, y: scrollTop }));
    }
  }, []);

  // Measure on mount and whenever layout-affecting props change
  useEffect(() => {
    measureScrollbars();
    const onResize = () => measureScrollbars();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measureScrollbars, durationInFrames, pixelsPerFrame, viewportWidth]);

  // 拖放处理
  const handleContainerDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);

    // Store drag data globally when entering
    globalDragData = {
      assetId: e.dataTransfer.getData('assetId') || e.dataTransfer.getData('text/plain'),
      quickAdd: e.dataTransfer.getData('quickAdd'),
      quickAddType: e.dataTransfer.getData('quickAddType'),
      asset: e.dataTransfer.getData('asset'),
    };
  }, []);

  const handleContainerDragLeave = useCallback((e: React.DragEvent) => {
    // 检查是否是真正离开容器
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isOutside =
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom;

    if (isOutside) {
      setIsDraggingOver(false);
      setInsertPosition(null);
    }
  }, []);

  const handleContainerDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); // CRITICAL: Must prevent default to allow drop
    e.dataTransfer.dropEffect = 'copy'; // CRITICAL: Must match effectAllowed from drag source
    onDragOver(e); // Call the parent's handler
  }, [onDragOver]);

  const handleContainerDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    const currentInsertPosition = effectiveInsertPosition;
    setInsertPosition(null);

    // 如果有插入位置，调用 handleInsertDrop
    if (currentInsertPosition !== null) {
      if (handleInsertDropRef.current) {
        handleInsertDropRef.current(e, currentInsertPosition);
      }
      return;
    }

    // 如果没有轨道，调用空状态的 drop 处理
    if (tracks.length === 0) {
      onEmptyDrop(e);
      return;
    }

    // NEW: Handle drop onto an existing track (when not at edge)
    if (!viewportRef.current) return;
    
    const dragType = e.dataTransfer.getData('dragType') || 
                     (window.currentDraggedItem ? 'item' : 'asset');
    
    // Only handle asset drops here (item drops are handled by TimelineItem)
    if (dragType !== 'item' && !window.currentDraggedItem) {
      const rect = viewportRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top + viewportRef.current.scrollTop;
      const trackIndex = Math.floor(y / timeline.trackHeight);
      
      if (trackIndex >= 0 && trackIndex < tracks.length) {
        // Drop onto existing track
        onDrop(tracks[trackIndex].id, e);
      }
    }
  }, [tracks, onEmptyDrop, onDrop, effectiveInsertPosition]);

  // 检测鼠标是否在两个轨道之间
  const detectInsertPosition = useCallback((e: React.DragEvent) => {
    if (!viewportRef.current) return;

    // 如果timeline是空的，总是在位置0插入新轨道
    if (tracks.length === 0) {
      setInsertPosition(0);
      return 0;
    }

    const rect = viewportRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top + viewportRef.current.scrollTop;
    const trackIndex = Math.floor(y / timeline.trackHeight);
    const relativeY = y % timeline.trackHeight;

    // Check if this is an existing item drag (different behavior for new assets)
    const dragType = e.dataTransfer.types.includes('dragType')
      ? e.dataTransfer.getData('dragType')
      : (window.currentDraggedItem ? 'item' : 'asset');

    // For existing items, use tighter threshold (only at very edges)
    // For new assets, use wider threshold to make track insertion easier
    const threshold = dragType === 'item' ? 10 : 20;

    // 如果鼠标在轨道边界附近
    if (relativeY < threshold || relativeY > timeline.trackHeight - threshold) {
      const position = relativeY < threshold ? trackIndex : trackIndex + 1;
      if (position >= 0 && position <= tracks.length) {
        setInsertPosition(position);
        return position;
      }
    }

    setInsertPosition(null);
    return null;
  }, [tracks]);

  // 处理轨道间插入
  const handleInsertDrop = useCallback((e: React.DragEvent, position: number) => {
    e.preventDefault();
    e.stopPropagation();

    console.log('[TimelineTracksContainer.handleInsertDrop] Insert drop triggered:', {
      position,
      mouseX: e.clientX,
      mouseY: e.clientY,
    });

    // Check if this is an existing item being moved
    const dragType = e.dataTransfer.getData('dragType');
    const itemId = e.dataTransfer.getData('itemId');
    const sourceTrackId = e.dataTransfer.getData('trackId');


    if (dragType === 'item' || window.currentDraggedItem) {
      // Moving an existing item to a new track

      const itemToMove = window.currentDraggedItem?.item;
      const sourceTrack = window.currentDraggedItem?.trackId || sourceTrackId;


      if (!itemToMove || !sourceTrack) {
        console.error('ERROR: Missing item or source track information');
        console.error('  - itemToMove:', itemToMove);
        console.error('  - sourceTrack:', sourceTrack);
        return;
      }

      // 立即清除window.currentDraggedItem，防止dragOver继续处理
      window.currentDraggedItem = null;

      // 找到当前item所在的实际track（可能已经被dragOver移动过）
      const currentTrack = tracks.find(t => t.items.some(i => i.id === itemToMove.id));
      const actualSourceTrackId = currentTrack?.id || sourceTrack;


      // Create new track with the item already in it
      // This way we avoid the issue of REMOVE_ITEM auto-deleting empty tracks
      const newTrack = {
        id: `track-${Date.now()}`,
        name: itemToMove.type.charAt(0).toUpperCase() + itemToMove.type.slice(1),
        items: [itemToMove]  // Start with the item already in the track
      };

      // Insert new track at the specified position (with item already in it)
      dispatch({
        type: 'INSERT_TRACK',
        payload: { track: newTrack, index: position }
      });

      // Then remove item from the source track
      setTimeout(() => {
        dispatch({
          type: 'REMOVE_ITEM',
          payload: { trackId: actualSourceTrackId, itemId: itemToMove.id }
        });

        // Select the moved item
        dispatch({ type: 'SELECT_ITEM', payload: itemToMove.id });
      }, 0);

      return;
    }

    // Otherwise, handle creating new items from assets
    // Try to get assetId from multiple sources, fallback to global data
    let assetId = e.dataTransfer.getData('assetId') ||
                  e.dataTransfer.getData('text/plain') ||
                  globalDragData.assetId;

    const isQuickAdd = (e.dataTransfer.getData('quickAdd') || globalDragData.quickAdd) === 'true';
    const quickAddType = e.dataTransfer.getData('quickAddType') || globalDragData.quickAddType;
    const assetData = e.dataTransfer.getData('asset') || globalDragData.asset;

    // If we still don't have assetId, try to get it from currentDraggedAsset
    let finalIsQuickAdd = isQuickAdd;
    let finalQuickAddType = quickAddType;

    if (!assetId && currentDraggedAsset) {
      assetId = currentDraggedAsset.id;
      if (currentDraggedAsset.quickAdd) {
        finalIsQuickAdd = true;
        finalQuickAddType = currentDraggedAsset.quickAddType;
      }
    }


    // 创建新轨道并插入到指定位置
    const itemType = (finalIsQuickAdd ? finalQuickAddType : assets.find(a => a.id === assetId)?.type) ?? 'track';
    const newTrack = {
      id: `track-${Date.now()}`,
      name: itemType.charAt(0).toUpperCase() + itemType.slice(1),
      items: []
    };

    // 插入轨道到指定位置
    dispatch({
      type: 'INSERT_TRACK',
      payload: { track: newTrack, index: position }
    });

    // 计算 drop 位置（与 Timeline.handleDrop 保持一致）
    const viewportEl = viewportRef.current;
    if (!viewportEl) {
      console.error('[handleInsertDrop] No viewport element found');
      return;
    }

    const rect = viewportEl.getBoundingClientRect();
    const mouseX = e.clientX - rect.left + viewportEl.scrollLeft;
    // 减去 asset 拖动偏移量，与预览位置保持一致
    const assetLeftX = mouseX - currentAssetDragOffset;
    const rawFrame = Math.max(0, Math.round(assetLeftX / pixelsPerFrame));

    console.log('[TimelineTracksContainer.handleInsertDrop] Position calc:', {
      mouseX: e.clientX,
      rectLeft: rect.left,
      scrollLeft: viewportEl.scrollLeft,
      currentAssetDragOffset,
      mouseXRelative: mouseX,
      assetLeftX,
      rawFrame,
      pixelsPerFrame,
    });

    const dropFrame = Math.max(0, rawFrame);

    // 添加素材到新轨道
    setTimeout(() => {
      let newItem: any = null;

      if (finalIsQuickAdd) {
        // Handle quick add items
        if (finalQuickAddType === 'text') {
          newItem = {
            id: `text-${Date.now()}`,
            type: 'text',
            text: 'Double click to edit',
            color: '#000000',
            from: dropFrame,
            durationInFrames: 90,
            fontSize: 60,
          };
        } else if (finalQuickAddType === 'solid') {
          newItem = {
            id: `solid-${Date.now()}`,
            type: 'solid',
            color: '#' + Math.floor(Math.random() * 16777215).toString(16),
            from: dropFrame,
            durationInFrames: 60,
          };
        }
      } else {
        // Handle regular assets
        const asset = assets.find(a => a.id === assetId) || currentDraggedAsset;
        if (!asset) {
          console.error('No asset found for id:', assetId);
          return;
        }

        switch (asset.type) {
          case 'video':
            newItem = {
              id: `item-${Date.now()}`,
              type: 'video',
              from: dropFrame,
              durationInFrames: (asset && asset.duration) ? secondsToFrames(asset.duration, fps) : 90,
              src: asset ? asset.src : '',
              waveform: asset ? asset.waveform : undefined,
            };
            break;
          case 'audio':
            newItem = {
              id: `item-${Date.now()}`,
              type: 'audio',
              from: dropFrame,
              durationInFrames: asset.duration ? secondsToFrames(asset.duration, fps) : 90,
              src: asset.src,
              waveform: asset.waveform,
            };
            break;
          case 'image':
            newItem = {
              id: `item-${Date.now()}`,
              type: 'image',
              from: dropFrame,
              durationInFrames: 90,
              src: asset.src,
            };
            break;
        }
      }

      console.log('[TimelineTracksContainer.handleInsertDrop] Creating item:', {
        dropFrame,
        newItem,
      });

      if (newItem) {
        dispatch({
          type: 'ADD_ITEM',
          payload: { trackId: newTrack.id, item: newItem }
        });
        dispatch({ type: 'SELECT_ITEM', payload: newItem.id });
      }
    }, 0);
  }, [assets, dispatch]);

  // 更新 handleInsertDrop 的 ref
  useEffect(() => {
    handleInsertDropRef.current = handleInsertDrop;
  }, [handleInsertDrop]);

  // 扩展拖动悬停处理
  const handleTrackAreaDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); // CRITICAL: Must prevent default to allow drop
    e.dataTransfer.dropEffect = 'copy'; // CRITICAL: Must match effectAllowed from drag source
    onDragOver(e);
    detectInsertPosition(e);
  }, [onDragOver, detectInsertPosition]);

  // Keep content at least as wide as the viewport to avoid empty scroll area on empty timeline
  const totalWidth = Math.max(durationInFrames * pixelsPerFrame, viewportWidth ?? 0);

  const content = (
    <div
      ref={containerRef}
      className="timeline-tracks-container"
      style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        background: isDraggingOver ? colors.bg.hover : colors.bg.primary,
        borderRadius: 4,
        margin: 0, // Remove all margins to eliminate gaps
        boxShadow: shadows.sm,
        // Avoid mixing border shorthand with borderLeft to prevent React warning.
        borderTop: 0,
        borderRight: 0,
        borderBottom: 0,
        borderLeft: 0,
        position: 'relative',
      }}
      onDragEnter={handleContainerDragEnter}
      onDragLeave={handleContainerDragLeave}
      onDragOver={handleContainerDragOver}
      onDrop={handleContainerDrop}
      onClick={(e) => {
        // 点击 timeline 空白区域时取消选中 item
        // 只在点击的是最外层容器自身时才取消选中(不是子元素冒泡上来的)
        if (e.target === e.currentTarget) {
          onSelectItem('');
        }
      }}
    >
      {/* 左侧标签面板（若提供 labelsPortal 则不内联渲染） */}
      {!labelsPortal && (
        <div
          ref={labelsRef}
          className="track-labels-panel"
          style={{
            width: timeline.trackLabelWidth,
            flexShrink: 0,
            background: colors.bg.secondary,
            borderRight: `1px solid ${colors.border.default}`,
            overflowY: 'auto',
            overflowX: 'hidden',
            position: 'sticky',
            left: 0,
            zIndex: 30,
            // Reserve space equal to the horizontal scrollbar in the tracks viewport
            // so the last row aligns when scrolled to bottom (esp. on Windows).
            paddingBottom: hScrollbar,
            // 隐藏滚动条但保持可滚动
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
          onScroll={handleLabelsScroll}
        >
          <style>{`
            .track-labels-panel::-webkit-scrollbar { display: none; }
          `}</style>

          {tracks.length === 0 ? (
            <div
              style={{
                height: 200,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: colors.text.tertiary,
                fontSize: 12,
                padding: spacing.md,
                textAlign: 'center',
              }}
            >
              轨道标签
            </div>
          ) : (
            displayTracks.map((track) => (
              <div
                key={track.id}
                style={{
                  height: timeline.trackHeight,
                  borderBottom: `1px solid ${colors.border.default}`,
                  padding: `${spacing.md}px`,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  background: selectedTrackId === track.id ? colors.bg.selected : 'transparent',
                  transition: 'background-color 0.15s ease',
                }}
                onClick={() => onSelectTrack(track.id)}
              >
                <div
                  style={{
                    color: colors.text.primary,
                    fontSize: 13,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {track.name}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 右侧轨道视口 */}
      <div
        ref={viewportRef}
        className="tracks-viewport"
        style={{
          flex: 1,
          overflowX: 'auto',
          overflowY: 'auto',
          position: 'relative',
          minWidth: 0,
          paddingLeft: contentInsetLeftPx ?? 0,
        }}
        onScroll={handleViewportScroll}
        onDragOver={handleTrackAreaDragOver}
      >
        <div
          style={{
            position: 'relative',
            minWidth: totalWidth,
            minHeight: '100%',
          }}
          onClick={(e) => {
            // 点击轨道视口的空白区域时取消选中
            if (e.target === e.currentTarget) {
              onSelectItem('');
            }
          }}
          onDrop={(e) => {
            // Handle drops when inserting between tracks or at the end
            if (effectiveInsertPosition !== null) {
              e.preventDefault();
              e.stopPropagation();
              handleInsertDrop(e, effectiveInsertPosition);
              setInsertPosition(null);
              setIsDraggingOver(false);
            } else {
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy'; // CRITICAL: Must match effectAllowed from drag source
            // Only use internal detection when no external insert position is provided
            if (externalInsertPosition == null) {
              detectInsertPosition(e);
            }
          }}
        >
          {tracks.length === 0 ? (
            // 空状态 - 使用 pointerEvents: 'none' 让 drop 事件穿透到父元素
            <div
              style={{
                height: 200,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: colors.text.tertiary,
                gap: spacing.lg,
                pointerEvents: 'none', // 让拖放事件穿透到父元素
              }}
            >
              <div style={{ fontSize: 48, opacity: 0.3 }}>🎬</div>
              <div style={{ fontSize: 16, fontWeight: 500 }}>开始你的创作</div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                拖放素材到这里开始编辑
              </div>
            </div>
          ) : (
            // 轨道列表 - 只渲染轨道内容区，不包括标签
            displayTracks.map((track, index) => (
              <Fragment key={track.id}>
                {/* 插入指示器 - 轨道上方 */}
                {effectiveInsertPosition === index && (
                  <div
                    style={{
                      position: 'relative',
                      height: 2,
                      backgroundColor: colors.accent.primary,
                      marginTop: -1,
                      marginBottom: -1,
                      zIndex: 10,
                      pointerEvents: 'none',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: colors.accent.primary,
                      }}
                    />
                  </div>
                )}

                <div
                  style={{
                    height: timeline.trackHeight,
                    borderBottom: `1px solid ${colors.border.default}`,
                    position: 'relative',
                    backgroundColor: selectedTrackId === track.id ? colors.bg.selected : 'transparent',
                  }}
                  onClick={(e) => {
                    // 点击轨道空白区域时取消选中 item
                    if (e.target === e.currentTarget) {
                      onSelectTrack(track.id);
                      onSelectItem(''); // 传空字符串取消选中
                    }
                  }}
                  onDragOver={(e) => {
                    // 检测插入位置
                    const insertPos = detectInsertPosition(e);
                    // 只在不是插入位置时才处理item拖动
                    if (insertPos === null) {
                      onItemDragOver(e, track.id);
                    }
                  }}
                  onDrop={(e) => {
                    // Don't handle drops that are meant for insertion
                    if (insertPosition !== null) {
                      return;  // Let the container handle it
                    }

                    // Clear any residual insert guideline when dropping onto a track
                    setInsertPosition(null);
                    setIsDraggingOver(false);

                    // Check if this is an existing item being dragged (not a new asset)
                    const dragType = e.dataTransfer.getData('dragType');
                    const isExistingItemDrag = dragType === 'item' || window.currentDraggedItem || dragPreview;
                    
                    if (isExistingItemDrag) {
                      // Item drag - call onItemDrop
                      onItemDrop(e, track.id);
                    } else {
                      // New asset from AssetPanel - add to existing track
                      e.preventDefault();
                      e.stopPropagation();
                      onDrop(track.id, e);
                    }
                  }}
                >
                  {/* 使用 TimelineItem 组件保留所有功能 */}
                  {track.items.map((item, itemIndex) => {
                    // 检测相邻的 item（用于 Roll Edit）
                    const sortedItems = [...track.items].sort((a, b) => a.from - b.from);
                    const currentIndex = sortedItems.findIndex(i => i.id === item.id);
                    const leftItem = currentIndex > 0 ? sortedItems[currentIndex - 1] : null;
                    const rightItem = currentIndex < sortedItems.length - 1 ? sortedItems[currentIndex + 1] : null;

                    const hasAdjacentLeft = leftItem && (leftItem.from + leftItem.durationInFrames === item.from);
                    const hasAdjacentRight = rightItem && (item.from + item.durationInFrames === rightItem.from);

                    // Roll Edit 模式：当两个 item 相邻且都未选中时启用
                    const isInRollEditLeft = hasAdjacentLeft && selectedItemId !== item.id && selectedItemId !== leftItem.id;
                    const isInRollEditRight = hasAdjacentRight && selectedItemId !== item.id && selectedItemId !== rightItem.id;

                    // 检测是否应该显示高亮：自己被 hover 或相邻的 item 被 hover
                    const shouldHighlightLeft = isInRollEditLeft && (hoveredItemId === item.id || hoveredItemId === leftItem?.id);
                    const shouldHighlightRight = isInRollEditRight && (hoveredItemId === item.id || hoveredItemId === rightItem?.id);

                    return (<TimelineItem
                      key={item.id}
                      item={item}
                      trackId={track.id}
                      track={track}
                      pixelsPerFrame={pixelsPerFrame}
                      isSelected={selectedItemId === item.id}
                      assets={assets}
                      onSelect={() => onSelectItem(item.id)}
                      onDelete={() => onDeleteItem(track.id, item.id)}
                      onUpdate={(itemId, updates) => onUpdateItem(track.id, itemId, updates)}
                      onDragStart={(e) => onItemDragStart(e, track.id, item)}
                      onDragEnd={onItemDragEnd}
                      hasAdjacentItemOnLeft={isInRollEditLeft}
                      hasAdjacentItemOnRight={isInRollEditRight}
                      shouldHighlightLeft={shouldHighlightLeft}
                      shouldHighlightRight={shouldHighlightRight}
                      onHoverChange={(isHovered) => setHoveredItemId(isHovered ? item.id : null)}
                      onResize={(edge, deltaFrames) => {
                        // 获取素材总帧数
                        let totalFramesForAsset: number | undefined;
                        if ((item.type === 'video' || item.type === 'audio') && 'src' in item) {
                          const asset = assets.find((a) => a.src === item.src);
                          if (asset?.duration) {
                            totalFramesForAsset = Math.floor(asset.duration * fps);
                          }
                        }

                        const currentOffset = ((item as any).sourceStartInFrames || 0);
                        let newFrom = item.from;
                        let newDuration = item.durationInFrames;

                        if (edge === 'left') {
                          const rawFrom = Math.max(0, item.from + deltaFrames);

                          // 应用吸附（左边缘）
                          const snapped = calculateResizeSnap(
                            rawFrom,
                            'left',
                            state.tracks,
                            item.id,
                            state.currentFrame,
                            !!snapEnabled,
                            timeline.snapThreshold
                          );
                          newFrom = snapped.snappedFrame;
                          newDuration = item.from + item.durationInFrames - newFrom;

                          // 检查与同一 track 中其他 item 的重叠
                          const otherItems = track.items.filter(i => i.id !== item.id);
                          for (const other of otherItems) {
                            const otherEnd = other.from + other.durationInFrames;
                            // 如果新位置会与其他 item 重叠，限制在其右边缘
                            if (newFrom < otherEnd && (item.from + item.durationInFrames) > other.from) {
                              if (newFrom < otherEnd) {
                                newFrom = otherEnd;
                                newDuration = item.from + item.durationInFrames - newFrom;
                              }
                            }
                          }

                          // 计算新的源偏移
                          const consumed = newFrom - item.from;
                          const proposedOffset = Math.max(0, currentOffset + consumed);

                          // 基于新的偏移来限制最大时长
                          if (totalFramesForAsset !== undefined) {
                            const maxDurByAsset = Math.max(0, totalFramesForAsset - proposedOffset);
                            if (newDuration > maxDurByAsset) {
                              newDuration = Math.max(15, maxDurByAsset);
                            }
                          }
                        } else {
                          // 右侧 resize
                          const rawDuration = Math.max(15, item.durationInFrames + deltaFrames);
                          const rawRight = item.from + rawDuration;

                          // 应用吸附（右边缘）
                          const snapped = calculateResizeSnap(
                            rawRight,
                            'right',
                            state.tracks,
                            item.id,
                            state.currentFrame,
                            !!snapEnabled,
                            timeline.snapThreshold
                          );
                          newDuration = Math.max(15, snapped.snappedFrame - item.from);

                          // 检查与同一 track 中其他 item 的重叠
                          const otherItems = track.items.filter(i => i.id !== item.id);
                          for (const other of otherItems) {
                            const newEnd = item.from + newDuration;
                            // 如果新的右边缘会与其他 item 重叠，限制在其左边缘
                            if (newEnd > other.from && item.from < (other.from + other.durationInFrames)) {
                              if (newEnd > other.from) {
                                newDuration = Math.max(15, other.from - item.from);
                              }
                            }
                          }

                          // 基于当前偏移来限制最大时长
                          if (totalFramesForAsset !== undefined) {
                            const maxDurByAsset = Math.max(0, totalFramesForAsset - currentOffset);
                            if (newDuration > maxDurByAsset) {
                              newDuration = Math.max(15, maxDurByAsset);
                            }
                          }
                        }

                        if (newDuration >= 15) {
                          const consumed = newFrom - item.from;
                          const newSourceOffset = Math.max(0, ((item as any).sourceStartInFrames || 0) + (edge === 'left' ? consumed : 0));
                          onUpdateItem(track.id, item.id, {
                            from: newFrom,
                            durationInFrames: newDuration,
                            ...(item.type === 'video' || item.type === 'audio' ? { sourceStartInFrames: newSourceOffset } : {}),
                          } as any);
                        }
                      }}
                      onRollEdit={(edge, deltaFrames) => {
                        // Roll Edit: 同时调整当前 item 和相邻 item，总时长不变
                        if (edge === 'left' && isInRollEditLeft && leftItem) {
                          // 左边缘 Roll Edit
                          // 当前 item: from 减少，duration 增加，sourceStartInFrames 减少
                          // 左侧 item: duration 减少

                          const currentOffset = (item as any).sourceStartInFrames || 0;
                          const newCurrentFrom = Math.max(0, item.from + deltaFrames);
                          const currentDeltaFrames = newCurrentFrom - item.from; // 负数表示向左

                          // 计算新的源偏移
                          const newCurrentOffset = Math.max(0, currentOffset + currentDeltaFrames);
                          const newCurrentDuration = item.durationInFrames - currentDeltaFrames;

                          // 左侧 item 的时长相应减少
                          const newLeftDuration = Math.max(15, leftItem.durationInFrames + currentDeltaFrames);

                          // 同时更新两个 item
                          onUpdateItem(track.id, item.id, {
                            from: newCurrentFrom,
                            durationInFrames: newCurrentDuration,
                            ...(item.type === 'video' || item.type === 'audio' ? { sourceStartInFrames: newCurrentOffset } : {}),
                          } as any);

                          onUpdateItem(track.id, leftItem.id, {
                            durationInFrames: newLeftDuration,
                          } as any);

                        } else if (edge === 'right' && isInRollEditRight && rightItem) {
                          // 右边缘 Roll Edit
                          // 当前 item: duration 变化
                          // 右侧 item: from 变化，duration 反向变化，sourceStartInFrames 变化

                          const rawNewDuration = Math.max(15, item.durationInFrames + deltaFrames);
                          const actualDelta = rawNewDuration - item.durationInFrames;

                          const rightOffset = (rightItem as any).sourceStartInFrames || 0;
                          const newRightFrom = rightItem.from + actualDelta;
                          const newRightOffset = Math.max(0, rightOffset + actualDelta);
                          const newRightDuration = Math.max(15, rightItem.durationInFrames - actualDelta);

                          // 同时更新两个 item
                          onUpdateItem(track.id, item.id, {
                            durationInFrames: rawNewDuration,
                          } as any);

                          onUpdateItem(track.id, rightItem.id, {
                            from: newRightFrom,
                            durationInFrames: newRightDuration,
                            ...(rightItem.type === 'video' || rightItem.type === 'audio' ? { sourceStartInFrames: newRightOffset } : {}),
                          } as any);
                        }
                      }}
                    />
                  );
                  })}

                  {/* Asset拖动预览框（纯视觉预览，不是真实item） */}
                  {/* 与 item 拖动预览保持一致：当要插入新 track 时（externalInsertPosition != null），不显示预览 */}
                  {assetDragPreview && assetDragPreview.trackId === track.id && externalInsertPosition == null && (
                    <div
                      style={{
                        position: 'absolute',
                        left: assetDragPreview.item.from * pixelsPerFrame,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: assetDragPreview.item.durationInFrames * pixelsPerFrame,
                        height: getPreviewItemHeight(assetDragPreview.item),
                        backgroundColor: 'rgba(100,180,255,0.25)',
                        border: '2px dashed rgba(100,180,255,0.7)',
                        borderRadius: timeline.itemBorderRadius,
                        pointerEvents: 'none',
                        zIndex: 2,
                        boxSizing: 'border-box',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'rgba(255,255,255,0.6)',
                        fontSize: 12,
                        opacity: 0.8,
                      }}
                    >
                      {assetDragPreview.item.type}
                    </div>
                  )}

                  {/* 渲染预览框（目标位置指示器）- 显示松手后item会落在哪里 */}
                  {dragPreview && dragPreview.previewTrackId === track.id && externalInsertPosition == null && (
                    <div
                      style={{
                        position: 'absolute',
                        left: dragPreview.previewFrame * pixelsPerFrame,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: dragPreview.item.durationInFrames * pixelsPerFrame,
                        height: getPreviewItemHeight(dragPreview.item),
                        backgroundColor: 'rgba(255,255,255,0.15)',
                        border: '2px dashed rgba(255,255,255,0.5)',
                        borderRadius: timeline.itemBorderRadius,
                        pointerEvents: 'none',
                        zIndex: 1,
                        boxSizing: 'border-box',
                      }}
                    />
                  )}
                </div>

                {/* 插入指示器 - 最后一个轨道下方 */}
                {effectiveInsertPosition === tracks.length && index === tracks.length - 1 && (
                  <div
                    style={{
                      position: 'relative',
                      height: 2,
                      backgroundColor: colors.accent.primary,
                      marginTop: -1,
                      zIndex: 10,
                      pointerEvents: 'none',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: colors.accent.primary,
                      }}
                    />
                  </div>
                )}
              </Fragment>
            ))
          )}

          {/* 垂直吸附指示线（对齐到其他素材边缘时显示） */}
          {dragPreview?.snapGuideFrame != null && (
            <div
              style={{
                position: 'absolute',
                left: dragPreview.snapGuideFrame * pixelsPerFrame,
                top: 0,
                bottom: 0,
                width: 2,
                backgroundColor: colors.accent.primary,
                opacity: 0.9,
                pointerEvents: 'none',
                zIndex: 50,
              }}
            />
          )}
        </div>
      </div>

      {/* 拖放指示器 */}
      {isDraggingOver && tracks.length === 0 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `${colors.accent.primary}10`,
            border: `2px dashed ${colors.accent.primary}`,
            borderRadius: 4,
            pointerEvents: 'none',
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: colors.bg.elevated,
              padding: `${spacing.lg}px ${spacing.xxl}px`,
              borderRadius: 6,
              boxShadow: shadows.lg,
              color: colors.text.primary,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            松开以添加到时间轴
          </div>
        </div>
      )}
    </div>
  );

  // Optional: Render labels panel externally using a portal
  if (labelsPortal) {
    const labelsNode = (
      <div
        ref={labelsRef}
        className="track-labels-panel"
        style={{
          width: timeline.trackLabelWidth,
          flexShrink: 0,
          background: colors.bg.secondary,
          borderRight: `1px solid ${colors.border.default}`,
          overflowY: 'auto',
          overflowX: 'hidden',
          position: 'sticky',
          left: 0,
          zIndex: 30,
          paddingBottom: hScrollbar,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          height: '100%',
        }}
        onScroll={handleLabelsScroll}
      >
        <style>{`.track-labels-panel::-webkit-scrollbar{display:none;}`}</style>
        {tracks.length === 0 ? (
          <div
            style={{
              height: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: colors.text.tertiary,
              fontSize: 12,
              padding: spacing.md,
              textAlign: 'center',
            }}
          >
            轨道标签
          </div>
        ) : (
          displayTracks.map((track) => (
            <div
              key={track.id}
              style={{
                height: timeline.trackHeight,
                borderBottom: `1px solid ${colors.border.default}`,
                padding: `${spacing.md}px`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                cursor: 'pointer',
                background: selectedTrackId === track.id ? colors.bg.selected : 'transparent',
                transition: 'background-color 0.15s ease',
              }}
              onClick={() => onSelectTrack(track.id)}
            >
              <div
                style={{
                  color: colors.text.primary,
                  fontSize: 13,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {track.name}
              </div>
            </div>
          ))
        )}
      </div>
    );

    return (
      <>
        {createPortal(labelsNode, labelsPortal)}
        {content}
      </>
    );
  }

  return content;
};
