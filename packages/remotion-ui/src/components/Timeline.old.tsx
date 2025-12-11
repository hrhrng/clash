import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useEditor } from '@remotion-fast/core';
import type { Item, Track } from '@remotion-fast/core';
import { Reorder } from 'framer-motion';

export const Timeline: React.FC = () => {
  const { state, dispatch } = useEditor();
  const [draggedItem, setDraggedItem] = useState<{ trackId: string; item: Item } | null>(null);
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapPreview, setSnapPreview] = useState<{ trackId: string; frame: number; duration: number } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ trackId: string; frame: number; pixelX: number; duration: number; type: string; src?: string; thumbnail?: string } | null>(null);
  const [dragOffset, setDragOffset] = useState<number>(0); // 鼠标相对于素材左边缘的偏移量（像素）
  const [draggingPlayhead, setDraggingPlayhead] = useState(false);
  const [draggingFade, setDraggingFade] = useState<{ itemId: string; trackId: string; type: 'in' | 'out' } | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null); // Track hovered item
  const [draggingVolume, setDraggingVolume] = useState<{ itemId: string; trackId: string } | null>(null); // Track volume line dragging
  const timelineRef = useRef<HTMLDivElement>(null);

  // 触控板缩放支持
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // 检测是否为 Pinch 手势（Ctrl/Cmd + 滚轮）
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();

        // deltaY < 0 表示放大，> 0 表示缩小
        const delta = -e.deltaY * 0.01;
        const newZoom = Math.max(0.5, Math.min(5, state.zoom + delta));

        dispatch({ type: 'SET_ZOOM', payload: newZoom });
      }
    };

    const timeline = timelineRef.current;
    if (timeline) {
      timeline.addEventListener('wheel', handleWheel, { passive: false });
      return () => timeline.removeEventListener('wheel', handleWheel);
    }
  }, [state.zoom, dispatch]);

  const pixelsPerFrame = 2 * state.zoom;
  const trackHeight = 80; // Increased to accommodate taller items with waveforms
  const snapThreshold = 3; // 吸附阈值（帧数）- 更精确

  // 智能吸附到网格和其他items
  const getSnappedFrame = (rawFrame: number, excludeItemId?: string, disableSnap?: boolean): { frame: number; snapped: boolean } => {
    // 如果禁用吸附，直接返回原始帧
    if (disableSnap) {
      return { frame: rawFrame, snapped: false };
    }
    let closestFrame = rawFrame;
    let minDistance = snapThreshold + 1;

    // 收集所有吸附点
    const snapPoints: number[] = [];

    // 1. 优先吸附到轨道起点
    snapPoints.push(0);

    // 2. 添加所有items的边界作为吸附点（优先级最高）
    state.tracks.forEach(track => {
      track.items.forEach(item => {
        if (item.id !== excludeItemId) {
          snapPoints.push(item.from); // 开始位置
          snapPoints.push(item.from + item.durationInFrames); // 结束位置
        }
      });
    });

    // 找到最近的吸附点
    snapPoints.forEach(point => {
      const distance = Math.abs(rawFrame - point);
      if (distance < minDistance) {
        minDistance = distance;
        closestFrame = point;
      }
    });

    // 3. 如果没有找到Item吸附点，尝试网格吸附（每5帧）
    if (minDistance > snapThreshold) {
      const gridSize = 5;
      const gridPoint = Math.round(rawFrame / gridSize) * gridSize;
      const gridDistance = Math.abs(rawFrame - gridPoint);
      if (gridDistance < snapThreshold && gridDistance < minDistance) {
        closestFrame = gridPoint;
        minDistance = gridDistance;
      }
    }

    return {
      frame: closestFrame,
      snapped: minDistance < snapThreshold,
    };
  };

  const handleTrackClick = (trackId: string) => {
    dispatch({ type: 'SELECT_TRACK', payload: trackId });
  };

  const handleItemClick = (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    dispatch({ type: 'SELECT_ITEM', payload: itemId });
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    // Don't change frame if we're dragging the playhead
    if (draggingPlayhead) return;

    if (timelineRef.current) {
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - 200; // Account for track labels
      const frame = Math.floor(x / pixelsPerFrame);
      if (frame >= 0 && frame <= state.durationInFrames) {
        dispatch({ type: 'SET_CURRENT_FRAME', payload: frame });
      }
    }
  };

  const handlePlayheadMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggingPlayhead(true);
  };

  const handlePlayheadDrag = (e: MouseEvent) => {
    if (!draggingPlayhead || !timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - 200;
    const frame = Math.max(0, Math.min(state.durationInFrames, Math.floor(x / pixelsPerFrame)));
    dispatch({ type: 'SET_CURRENT_FRAME', payload: frame });
  };

  const handlePlayheadMouseUp = () => {
    setDraggingPlayhead(false);
  };

  React.useEffect(() => {
    if (draggingPlayhead) {
      window.addEventListener('mousemove', handlePlayheadDrag);
      window.addEventListener('mouseup', handlePlayheadMouseUp);
      return () => {
        window.removeEventListener('mousemove', handlePlayheadDrag);
        window.removeEventListener('mouseup', handlePlayheadMouseUp);
      };
    }
  }, [draggingPlayhead, pixelsPerFrame, state.durationInFrames]);

  // Audio fade drag handlers
  const handleFadeMouseDown = (e: React.MouseEvent, itemId: string, trackId: string, type: 'in' | 'out') => {
    e.stopPropagation();
    e.preventDefault(); // Prevent dragging the item
    setDraggingFade({ itemId, trackId, type });
  };

  const handleFadeDrag = (e: MouseEvent) => {
    if (!draggingFade || !timelineRef.current) return;

    const track = state.tracks.find(t => t.id === draggingFade.trackId);
    if (!track) return;

    const item = track.items.find(i => i.id === draggingFade.itemId);
    if (!item || (item.type !== 'video' && item.type !== 'audio')) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - 200;
    const relativeX = x - (item.from * pixelsPerFrame);
    const frames = Math.max(0, Math.floor(relativeX / pixelsPerFrame));

    if (draggingFade.type === 'in') {
      const maxFade = Math.floor((item.durationInFrames * 2) / 3); // 2/3 of duration
      const newFadeIn = Math.max(0, Math.min(maxFade, frames));
      dispatch({
        type: 'UPDATE_ITEM',
        payload: {
          trackId: draggingFade.trackId,
          itemId: draggingFade.itemId,
          updates: { audioFadeIn: newFadeIn },
        },
      });
    } else {
      const distanceFromEnd = item.durationInFrames - frames;
      const maxFade = Math.floor((item.durationInFrames * 2) / 3); // 2/3 of duration
      const newFadeOut = Math.max(0, Math.min(maxFade, distanceFromEnd));
      dispatch({
        type: 'UPDATE_ITEM',
        payload: {
          trackId: draggingFade.trackId,
          itemId: draggingFade.itemId,
          updates: { audioFadeOut: newFadeOut },
        },
      });
    }
  };

  const handleFadeMouseUp = () => {
    setDraggingFade(null);
  };

  React.useEffect(() => {
    if (draggingFade) {
      window.addEventListener('mousemove', handleFadeDrag);
      window.addEventListener('mouseup', handleFadeMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleFadeDrag);
        window.removeEventListener('mouseup', handleFadeMouseUp);
      };
    }
  }, [draggingFade, pixelsPerFrame, state.tracks]);

  // Volume line drag handlers
  const handleVolumeMouseDown = (e: React.MouseEvent, itemId: string, trackId: string) => {
    console.log('Volume mousedown', itemId, trackId);
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    setDraggingVolume({ itemId, trackId });
  };

  const handleVolumeDrag = (e: MouseEvent) => {
    if (!draggingVolume) {
      console.log('No dragging volume state');
      return;
    }

    console.log('Dragging volume', draggingVolume);

    const track = state.tracks.find(t => t.id === draggingVolume.trackId);
    if (!track) {
      console.log('Track not found');
      return;
    }

    const item = track.items.find(i => i.id === draggingVolume.itemId);
    if (!item || (item.type !== 'video' && item.type !== 'audio')) {
      console.log('Item not found or wrong type', item);
      return;
    }

    // Find the waveform element to get its bounds
    const waveformElement = document.querySelector(`[data-waveform-id="${item.id}"]`);
    if (!waveformElement) {
      console.log('Waveform element not found', item.id);
      return;
    }

    const rect = waveformElement.getBoundingClientRect();
    const rawY = e.clientY - rect.top;
    const waveformHeight = rect.height;

    // Clamp y to stay within waveform bounds (prevent going outside container)
    const y = Math.max(0, Math.min(waveformHeight, rawY));

    // Calculate volume based on the new line position formula
    // lineY = waveformHeight * (1 - volume / 2)
    // Solving for volume: volume = (1 - lineY / waveformHeight) * 2
    // volume = (1 - y / waveformHeight) * 2
    const normalizedY = y / waveformHeight; // 0 = top, 1 = bottom
    const volume = Math.max(0, Math.min(2, (1 - normalizedY) * 2));

    console.log('🎚️ Volume Drag Debug:', {
      mouseY: e.clientY,
      rectTop: rect.top,
      rectHeight: rect.height,
      rawY,
      clampedY: y,
      normalizedY,
      calculatedVolume: (1 - normalizedY) * 2,
      finalVolume: volume,
      expectedLineY: waveformHeight * (1 - volume / 2)
    });

    dispatch({
      type: 'UPDATE_ITEM',
      payload: {
        trackId: draggingVolume.trackId,
        itemId: draggingVolume.itemId,
        updates: { volume },
      },
    });
  };

  const handleVolumeMouseUp = () => {
    setDraggingVolume(null);
  };

  React.useEffect(() => {
    if (draggingVolume) {
      window.addEventListener('mousemove', handleVolumeDrag);
      window.addEventListener('mouseup', handleVolumeMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleVolumeDrag);
        window.removeEventListener('mouseup', handleVolumeMouseUp);
      };
    }
  }, [draggingVolume, state.tracks]);

  const handleItemDragStart = (e: React.DragEvent, trackId: string, item: Item) => {
    // Prevent drag if we're dragging volume line
    if (draggingVolume) {
      e.preventDefault();
      return;
    }

    setDraggedItem({ trackId, item });
    e.dataTransfer.effectAllowed = 'move';

    // 隐藏浏览器默认的拖动图像
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);

    // 计算鼠标相对于素材左边缘的偏移量
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    setDragOffset(offsetX);
  };

  const handleItemDragOver = (e: React.DragEvent, trackId: string) => {
    e.preventDefault();

    // Check if it's an asset being dragged
    const hasAsset = e.dataTransfer.types.includes('asset');
    e.dataTransfer.dropEffect = hasAsset ? 'copy' : 'move';

    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - 200;

    // 预览框左边缘位置 = 鼠标位置 - 拖动偏移量
    const previewLeftX = hasAsset ? mouseX : mouseX - dragOffset;
    const rawFrame = Math.max(0, Math.floor(previewLeftX / pixelsPerFrame));

    // 计算吸附 - Shift键或按钮禁用吸附
    const disableSnap = e.shiftKey || !snapEnabled;
    const snapResult = getSnappedFrame(rawFrame, draggedItem?.item.id, disableSnap);

    // 如果是从 timeline 拖动已有素材，实时更新位置
    if (draggedItem) {
      dispatch({
        type: 'UPDATE_ITEM',
        payload: {
          trackId: draggedItem.trackId,
          itemId: draggedItem.item.id,
          updates: { from: snapResult.frame },
        },
      });

      // 如果跨轨道拖动，需要移动到新轨道
      if (trackId !== draggedItem.trackId) {
        // 先从旧轨道删除
        dispatch({
          type: 'REMOVE_ITEM',
          payload: { trackId: draggedItem.trackId, itemId: draggedItem.item.id },
        });
        // 添加到新轨道
        dispatch({
          type: 'ADD_ITEM',
          payload: {
            trackId: trackId,
            item: { ...draggedItem.item, from: snapResult.frame },
          },
        });
        // 更新 draggedItem 的 trackId
        setDraggedItem({ trackId, item: draggedItem.item });
      }

      // 设置吸附预览
      if (snapResult.snapped) {
        setSnapPreview({
          trackId,
          frame: snapResult.frame,
          duration: draggedItem.item.durationInFrames,
        });
      } else {
        setSnapPreview(null);
      }
    } else if (hasAsset) {
      // 从 Assets 拖动新素材，显示预览
      let duration = 90;
      let type = 'item';
      let src: string | undefined;
      let thumbnail: string | undefined;

      try {
        const assetData = e.dataTransfer.getData('asset');
        if (assetData) {
          const asset = JSON.parse(assetData);
          type = asset.type;
          src = asset.src;
          thumbnail = asset.thumbnail;
          if (asset.type === 'video' || asset.type === 'audio') {
            duration = 150;
          } else if (asset.type === 'image') {
            duration = 90;
          }
        }
      } catch (err) {
        // 忽略解析错误
      }

      setDragPreview({
        trackId,
        frame: snapResult.frame,
        pixelX: previewLeftX,
        duration,
        type,
        src,
        thumbnail,
      });

      if (snapResult.snapped) {
        setSnapPreview({
          trackId,
          frame: snapResult.frame,
          duration,
        });
      } else {
        setSnapPreview(null);
      }
    }
  };

  const handleItemDrop = (e: React.DragEvent, targetTrackId: string) => {
    e.preventDefault();
    setSnapPreview(null); // 清除吸附预览
    setDragPreview(null); // 清除拖动预览

    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - 200;

    // Check if dragging from Assets panel
    const assetData = e.dataTransfer.getData('asset');

    if (assetData) {
      // 从 Assets 拖入新素材
      const previewLeftX = mouseX;
      const rawFrame = Math.max(0, Math.floor(previewLeftX / pixelsPerFrame));
      const disableSnap = e.shiftKey || !snapEnabled;
      const snapResult = getSnappedFrame(rawFrame, undefined, disableSnap);
      const newFrom = snapResult.frame;

      try {
        const asset = JSON.parse(assetData);
        let newItem: Item;

        if (asset.type === 'video') {
          newItem = {
            id: `video-${Date.now()}`,
            type: 'video',
            src: asset.src,
            waveform: asset.waveform,
            from: newFrom,
            durationInFrames: 150, // 5 seconds default
            audioFadeIn: 0, // No default fade in
            audioFadeOut: 0, // No default fade out
          };
        } else if (asset.type === 'audio') {
          newItem = {
            id: `audio-${Date.now()}`,
            type: 'audio',
            src: asset.src,
            waveform: asset.waveform,
            from: newFrom,
            durationInFrames: 150,
            volume: 1,
            audioFadeIn: 0, // No default fade in
            audioFadeOut: 0, // No default fade out
          };
        } else if (asset.type === 'image') {
          newItem = {
            id: `image-${Date.now()}`,
            type: 'image',
            src: asset.src,
            from: newFrom,
            durationInFrames: 90, // 3 seconds default
          };
        } else {
          return;
        }

        dispatch({
          type: 'ADD_ITEM',
          payload: { trackId: targetTrackId, item: newItem },
        });
      } catch (err) {
        console.error('Failed to parse asset data:', err);
      }
    }
    // timeline 内的拖动已经在 dragOver 中实时处理了，这里不需要额外操作
  };

  const handleTrackDragStart = (e: React.DragEvent, trackId: string) => {
    setDraggedTrackId(trackId);
    e.dataTransfer.effectAllowed = 'move';
    // Prevent item drag when dragging track label
    e.stopPropagation();
  };

  const handleTrackDragOver = (e: React.DragEvent) => {
    // Only allow track reordering, not asset drops on track labels
    if (draggedTrackId) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleTrackDrop = (e: React.DragEvent, targetTrackId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedTrackId || draggedTrackId === targetTrackId) {
      setDraggedTrackId(null);
      return;
    }

    const draggedIndex = state.tracks.findIndex((t) => t.id === draggedTrackId);
    const targetIndex = state.tracks.findIndex((t) => t.id === targetTrackId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedTrackId(null);
      return;
    }

    // Reorder tracks
    const newTracks = [...state.tracks];
    const [removed] = newTracks.splice(draggedIndex, 1);
    newTracks.splice(targetIndex, 0, removed);

    dispatch({ type: 'REORDER_TRACKS', payload: newTracks });
    setDraggedTrackId(null);
  };

  const getItemColor = (item: Item): string => {
    switch (item.type) {
      case 'solid':
        return item.color;
      case 'text':
        return '#4CAF50';
      case 'video':
        return '#2196F3';
      case 'audio':
        return '#FF9800';
      case 'image':
        return '#9C27B0';
      default:
        return '#666666';
    }
  };

  const getColorByType = (type: string): string => {
    switch (type) {
      case 'text':
        return '#4CAF50';
      case 'video':
        return '#2196F3';
      case 'audio':
        return '#FF9800';
      case 'image':
        return '#9C27B0';
      default:
        return '#666666';
    }
  };

  const getItemLabel = (item: Item): string => {
    if (item.type === 'text') {
      return item.text;
    }
    if (item.type === 'solid') {
      return 'Solid';
    }
    // For media items (video, audio, image), extract filename from src
    if ('src' in item && item.src) {
      const filename = item.src.split('/').pop() || item.type;
      // Remove hash and extension for cleaner display
      const cleanName = filename.replace(/\.[^.]+$/, '').replace(/_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i, '');
      return cleanName.substring(0, 30); // Limit length
    }
    return item.type;
  };

  const handleDragEnd = () => {
    setDragPreview(null);
    setSnapPreview(null);
    setDragOffset(0);
    setDraggedItem(null);
  };

  const formatTime = (frame: number): string => {
    const totalSeconds = frame / state.fps;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames = frame % state.fps;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  // Render waveform as inline SVG with clipping indicator
  const renderWaveform = (
    waveform: number[],
    width: number,
    height: number,
    durationInFrames: number,
    audioFadeIn: number = 0,
    audioFadeOut: number = 0,
    volume: number = 1
  ) => {
    const barCount = waveform.length;
    const barWidth = width / barCount;

    return (
      <svg
        width={width}
        height={height}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          pointerEvents: 'none',
        }}
        preserveAspectRatio="none"
      >
        {waveform.map((peak, i) => {
          // Scale waveform by volume
          // At volume=1, peaks at 1.0 reach height/2 (center line)
          // At volume=2, peaks at 1.0 reach full height
          const targetBarHeight = peak * height * volume;
          const x = i * barWidth;

          // Check if clipping (exceeds container)
          const isClipping = targetBarHeight > height;
          const barHeight = Math.min(targetBarHeight, height);

          // Normal waveform (gray)
          const normalHeight = isClipping ? height : barHeight;

          return (
            <g key={i}>
              {/* Normal waveform part */}
              <rect
                x={x}
                y={height - normalHeight}
                width={Math.max(barWidth, 1)}
                height={normalHeight}
                fill="rgba(200, 200, 200, 0.9)"
              />
              {/* Red clipping indicator at top */}
              {isClipping && (
                <rect
                  x={x}
                  y={0}
                  width={Math.max(barWidth, 1)}
                  height={2}
                  fill="rgba(255, 60, 60, 0.9)"
                />
              )}
            </g>
          );
        })}
      </svg>
    );
  };

  // Render fade curve - smooth curve from bottom corner to handle center
  const renderFadeCurve = (
    width: number,
    height: number,
    fadeFrames: number,
    type: 'in' | 'out',
    pixelsPerFrame: number,
    thumbnailHeight: number
  ) => {
    if (fadeFrames <= 0) return null;

    const fadeWidth = fadeFrames * pixelsPerFrame;

    // Calculate handle center position
    // Handle is 12px wide, positioned with -6px offset, so center is at the fade position
    const handleCenterY = thumbnailHeight; // Button top is at thumbnailHeight - 6, plus 6px radius = thumbnailHeight

    // Create smooth quadratic curve from bottom corner to handle center (curved upward)
    let curvePath: string;
    let fillPath: string;

    if (type === 'in') {
      // Fade in: from bottom-left (0, height) to handle center (fadeWidth, handleCenterY)
      const handleCenterX = fadeWidth;
      const controlX = fadeWidth / 2;
      const controlY = handleCenterY - 1; // Very subtle upward curve
      curvePath = `M 0,${height} Q ${controlX},${controlY} ${handleCenterX},${handleCenterY}`;

      // Fill from curve to bottom (only covers waveform, not thumbnail or border)
      fillPath = `M 0,${height} Q ${controlX},${controlY} ${handleCenterX},${handleCenterY} L 0,${handleCenterY} Z`;
    } else {
      // Fade out: from bottom-right (width, height) to handle center (width - fadeWidth, handleCenterY)
      const handleCenterX = width - fadeWidth;
      const controlX = width - fadeWidth / 2;
      const controlY = handleCenterY - 1; // Very subtle upward curve
      curvePath = `M ${width},${height} Q ${controlX},${controlY} ${handleCenterX},${handleCenterY}`;

      // Fill from curve to bottom (only covers waveform, not thumbnail or border)
      fillPath = `M ${width},${height} Q ${controlX},${controlY} ${handleCenterX},${handleCenterY} L ${width},${handleCenterY} Z`;
    }

    return (
      <svg
        width={width}
        height={height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        {/* Black fill between curve and dividing line */}
        <path
          d={fillPath}
          fill="black"
        />
        {/* Curve line */}
        <path
          d={curvePath}
          stroke="rgba(100, 150, 255, 0.8)"
          strokeWidth="0.5"
          fill="none"
        />
      </svg>
    );
  };

  return (
    <>
      <style>{`
        /* Hide vertical scrollbar but keep horizontal - highest priority */
        div[data-timeline-container] {
          overflow-x: auto !important;
          overflow-y: auto !important;
        }

        /* Webkit browsers (Chrome, Safari, Edge) - Force hide vertical */
        div[data-timeline-container]::-webkit-scrollbar {
          width: 0px !important;
          height: 12px !important;
        }

        /* Horizontal scrollbar styling */
        div[data-timeline-container]::-webkit-scrollbar-track {
          background: #1a1a1a !important;
        }
        div[data-timeline-container]::-webkit-scrollbar-thumb {
          background: #3d3d3d !important;
          border-radius: 6px !important;
        }
        div[data-timeline-container]::-webkit-scrollbar-thumb:hover {
          background: #4d4d4d !important;
        }

        /* Firefox - make scrollbar thin and transparent for vertical */
        div[data-timeline-container] {
          scrollbar-width: thin !important;
          scrollbar-color: transparent #1a1a1a !important;
        }
      `}</style>
      <div style={styles.container}>
        <div style={styles.header}>
        <h2 style={styles.title}>Timeline</h2>
        <div style={styles.controls}>
          {/* 缩放按钮 */}
          <div style={styles.zoomControl}>
            <button
              onClick={() => dispatch({ type: 'SET_ZOOM', payload: Math.max(0.5, state.zoom - 0.25) })}
              style={styles.zoomButton}
              title="Zoom out"
            >
              −
            </button>
            <button
              onClick={() => dispatch({ type: 'SET_ZOOM', payload: Math.min(5, state.zoom + 0.25) })}
              style={styles.zoomButton}
              title="Zoom in"
            >
              +
            </button>
          </div>

          <button
            onClick={() => setSnapEnabled(!snapEnabled)}
            style={{
              ...styles.snapButton,
              backgroundColor: snapEnabled ? '#0066ff' : '#3d3d3d',
            }}
            title={snapEnabled ? '关闭自动吸附 (S)' : '开启自动吸附 (S)'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 9C4 6.79086 5.79086 5 8 5H10C12.2091 5 14 6.79086 14 9V15C14 17.2091 12.2091 19 10 19H8C5.79086 19 4 17.2091 4 15V9Z"
                fill={snapEnabled ? '#fff' : '#aaa'}
              />
              <path
                d="M10 9C10 6.79086 11.7909 5 14 5H16C18.2091 5 20 6.79086 20 9V15C20 17.2091 18.2091 19 16 19H14C11.7909 19 10 17.2091 10 15V9Z"
                fill={snapEnabled ? '#fff' : '#aaa'}
              />
              {snapEnabled && (
                <>
                  <circle cx="8" cy="12" r="1.5" fill="#0066ff" />
                  <circle cx="16" cy="12" r="1.5" fill="#0066ff" />
                </>
              )}
            </svg>
          </button>
          <span style={styles.timeLabel}>{formatTime(state.currentFrame)}</span>
        </div>
      </div>

      <div
        ref={timelineRef}
        style={{
          ...styles.timeline,
          marginRight: '-20px', // Hide vertical scrollbar by pushing it outside
          paddingRight: '20px', // Compensate for margin
        }}
        onClick={handleTimelineClick}
        data-timeline-container
      >
        {/* Ruler */}
        <div style={styles.ruler}>
          <div style={{ ...styles.rulerLabel, width: 200 }}>Tracks</div>
          <div style={styles.rulerTicks}>
            {(() => {
              // 简洁的刻度逻辑：基于秒数的固定间隔
              // 根据缩放级别选择合适的秒数间隔
              let secondsInterval;
              if (state.zoom >= 2.5) {
                secondsInterval = 1; // 每1秒
              } else if (state.zoom >= 1.5) {
                secondsInterval = 2; // 每2秒
              } else if (state.zoom >= 0.8) {
                secondsInterval = 5; // 每5秒
              } else {
                secondsInterval = 10; // 每10秒
              }

              const tickInterval = secondsInterval * state.fps;
              const tickCount = Math.ceil(state.durationInFrames / tickInterval);

              return Array.from({ length: tickCount + 1 }).map((_, i) => {
                const frame = i * tickInterval;
                if (frame > state.durationInFrames) return null;

                return (
                  <div
                    key={i}
                    style={{
                      ...styles.rulerTick,
                      left: frame * pixelsPerFrame,
                    }}
                  >
                    <div style={styles.rulerTickMark} />
                    <div style={styles.rulerTickLabel}>{formatTime(frame)}</div>
                  </div>
                );
              });
            })()}

            {/* Playhead Pin - in ruler */}
            {state.currentFrame >= 0 && (
              <div
                onMouseDown={handlePlayheadMouseDown}
                style={{
                  position: 'absolute',
                  top: '14px',
                  left: state.currentFrame * pixelsPerFrame,
                  width: '0',
                  height: '0',
                  borderLeft: '8px solid transparent',
                  borderRight: '8px solid transparent',
                  borderTop: '12px solid #0066ff',
                  cursor: 'ew-resize',
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                  transform: 'translateX(-8px)',
                  zIndex: 100,
                }}
                title="Drag to scrub timeline"
              />
            )}
          </div>
        </div>

        {/* Tracks */}
        <Reorder.Group
          axis="y"
          values={state.tracks}
          onReorder={(newTracks) => dispatch({ type: 'REORDER_TRACKS', payload: newTracks })}
          style={styles.tracks}
        >
          {/* Playhead Line - in tracks area only */}
          {state.currentFrame >= 0 && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: state.currentFrame * pixelsPerFrame + 200,
                width: '2px',
                backgroundColor: '#0066ff',
                pointerEvents: 'none',
                zIndex: 5,
              }}
            />
          )}

          {state.tracks.map((track) => (
            <Reorder.Item
              key={track.id}
              value={track}
              dragListener={false}
              dragControls={undefined}
              style={{
                ...styles.track,
                backgroundColor: state.selectedTrackId === track.id ? '#2a2a2a' : '#1e1e1e',
                listStyle: 'none',
              }}
              onClick={() => handleTrackClick(track.id)}
              onDragOver={(e) => handleItemDragOver(e, track.id)}
              onDrop={(e) => handleItemDrop(e, track.id)}
              onDragEnd={handleDragEnd}
            >
              <div
                style={styles.trackLabel}
              >
                <span style={styles.trackName}>{track.name}</span>
              </div>
              <div
                style={styles.trackContent}
                onPointerDown={(e) => {
                  // Prevent track reordering when clicking on track content
                  e.stopPropagation();
                }}
                draggable={false}
              >
                {/* Drag Preview - 跟随鼠标的完整预览 */}
                {dragPreview && dragPreview.trackId === track.id && (
                  <div
                    style={{
                      ...styles.item,
                      left: dragPreview.pixelX,
                      width: dragPreview.duration * pixelsPerFrame,
                      backgroundColor: getColorByType(dragPreview.type),
                      opacity: 1,
                      border: '1px solid rgba(0,0,0,0.2)',
                      pointerEvents: 'none',
                      backgroundImage: (dragPreview.type === 'video' ? dragPreview.thumbnail : dragPreview.src) ?
                        `url(${dragPreview.type === 'video' ? dragPreview.thumbnail : dragPreview.src})` : 'none',
                      backgroundSize: dragPreview.type === 'image' ? 'contain' : 'cover',
                      backgroundPosition: 'center',
                      backgroundRepeat: dragPreview.type === 'image' ? 'no-repeat' : 'repeat-x',
                    }}
                  >
                    <span style={{
                      ...styles.itemLabel,
                      backgroundColor: (dragPreview.thumbnail || dragPreview.src) ? 'rgba(0, 0, 0, 0.7)' : 'transparent',
                      padding: (dragPreview.thumbnail || dragPreview.src) ? '2px 6px' : '0',
                      borderRadius: (dragPreview.thumbnail || dragPreview.src) ? '3px' : '0',
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                    }}>
                      {dragPreview.type}
                    </span>
                  </div>
                )}

                {/* Snap Preview - 吸附目标的半透明框 */}
                {snapPreview && snapPreview.trackId === track.id && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '8px',
                      height: '44px',
                      left: snapPreview.frame * pixelsPerFrame,
                      width: snapPreview.duration * pixelsPerFrame,
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      border: 'none',
                      borderRadius: '4px',
                      pointerEvents: 'none',
                      zIndex: 3,
                    }}
                  />
                )}

                {/* Items */}
                {track.items.map((item) => {
                  const hasPreview = (item.type === 'video' || item.type === 'image') && 'src' in item;
                  // 获取缩略图URL：对于video使用从asset中获取的thumbnail，对于image直接使用src
                  let thumbnailUrl: string | undefined;
                  if (hasPreview) {
                    if (item.type === 'video') {
                      // 查找对应的asset来获取thumbnail
                      const asset = state.assets.find(a => a.src === item.src);
                      thumbnailUrl = asset?.thumbnail || item.src;
                    } else {
                      thumbnailUrl = item.src;
                    }
                  }

                  const hasWaveform = (item.type === 'audio' || item.type === 'video') && 'waveform' in item && item.waveform;
                  const itemHeight = hasWaveform ? 64 : 44; // Taller for items with waveform
                  // Account for border (2px selected, 1px unselected) with box-sizing: border-box
                  const borderSize = state.selectedItemId === item.id ? 4 : 2; // top + bottom
                  const availableHeight = itemHeight - borderSize;
                  const thumbnailHeight = hasWaveform ? Math.floor(availableHeight * 0.7) : 44; // 70% of available height
                  const waveformHeight = hasWaveform ? availableHeight - thumbnailHeight : 0; // Remaining 30%

                  // Get audio fade values
                  const audioFadeIn = ((item.type === 'video' || item.type === 'audio') && 'audioFadeIn' in item) ? item.audioFadeIn || 0 : 0;
                  const audioFadeOut = ((item.type === 'video' || item.type === 'audio') && 'audioFadeOut' in item) ? item.audioFadeOut || 0 : 0;

                  // Get volume value
                  const itemVolume = ((item.type === 'video' || item.type === 'audio') && 'volume' in item) ? item.volume ?? 1 : 1;

                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => handleItemDragStart(e, track.id, item)}
                      onDragEnd={handleDragEnd}
                      onClick={(e) => handleItemClick(e, item.id)}
                      onMouseEnter={() => setHoveredItemId(item.id)}
                      onMouseLeave={() => setHoveredItemId(null)}
                      style={{
                        ...styles.item,
                        height: `${itemHeight}px`,
                        left: item.from * pixelsPerFrame,
                        width: item.durationInFrames * pixelsPerFrame,
                        backgroundColor: getItemColor(item),
                        opacity: track.hidden ? 0.3 : 1,
                        boxSizing: 'border-box',
                        border:
                          state.selectedItemId === item.id
                            ? '2px solid #ffffff'
                            : '1px solid rgba(0,0,0,0.2)',
                        // Remove background image from main div for items with waveform
                        backgroundImage: (hasWaveform || item.type === 'audio') ? 'none' : (thumbnailUrl ? `url(${thumbnailUrl})` : 'none'),
                        backgroundSize: item.type === 'image' ? 'contain' : 'cover',
                        backgroundPosition: 'center',
                        backgroundRepeat: item.type === 'image' ? 'no-repeat' : 'repeat-x',
                      }}
                    >
                      {/* Thumbnail area for video - top part */}
                      {item.type === 'video' && thumbnailUrl && hasWaveform && (
                        <div
                          data-thumbnail-id={item.id}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: `${thumbnailHeight}px`,
                            backgroundImage: `url(${thumbnailUrl})`,
                            backgroundSize: 'auto 100%',
                            backgroundPosition: 'left top',
                            backgroundRepeat: 'repeat-x',
                            pointerEvents: 'none',
                            zIndex: 1,
                          }}
                        />
                      )}

                      {/* Render waveform for audio/video items - bottom part */}
                      {hasWaveform && (
                        <div
                          data-waveform-id={item.id}
                          draggable={false}
                          onDragStart={(e) => e.preventDefault()}
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            width: '100%',
                            height: `${waveformHeight}px`,
                            overflow: 'hidden',
                            zIndex: 2,
                            contain: 'strict',
                          }}
                        >
                          {renderWaveform(
                            item.waveform || [],
                            item.durationInFrames * pixelsPerFrame,
                            waveformHeight,
                            item.durationInFrames,
                            audioFadeIn,
                            audioFadeOut,
                            itemVolume
                          )}

                          {/* Volume control line - always rendered but only interactive on hover */}
                          {(item.type === 'audio' || item.type === 'video') && (() => {
                            // Get current volume from item - this will update when volume changes
                            let currentVolume = 1;
                            if (item.type === 'audio' && 'volume' in item) {
                              currentVolume = item.volume ?? 1;
                            } else if (item.type === 'video' && 'volume' in item) {
                              currentVolume = item.volume ?? 1;
                            }

                            // Volume line position - center at volume = 1.0
                            // volume = 0: line at bottom (y = waveformHeight)
                            // volume = 1: line at center (y = waveformHeight / 2)
                            // volume = 2: line at top (y = 0)
                            // Formula: lineY = waveformHeight * (1 - currentVolume / 2)
                            const lineY = waveformHeight * (1 - currentVolume / 2);
                            // Clamp line position to stay within container (0 to waveformHeight-1)
                            // This ensures the line never goes above the container
                            const clampedLineY = Math.max(0, Math.min(waveformHeight - 1, lineY));
                            const isHovered = hoveredItemId === item.id;

                            // Debug logging
                            if (isHovered) {
                              const waveformEl = document.querySelector(`[data-waveform-id="${item.id}"]`);
                              const waveformRect = waveformEl?.getBoundingClientRect();
                              const thumbnailEl = document.querySelector(`[data-thumbnail-id="${item.id}"]`);
                              const thumbnailRect = thumbnailEl?.getBoundingClientRect();
                              console.log('📏 Volume Line Debug:', {
                                itemId: item.id,
                                currentVolume,
                                waveformHeight,
                                thumbnailHeight,
                                lineY,
                                clampedLineY,
                                willExceed: clampedLineY < 0 || clampedLineY >= waveformHeight,
                                thumbnail: thumbnailRect ? {
                                  top: thumbnailRect.top,
                                  bottom: thumbnailRect.bottom,
                                  height: thumbnailRect.height
                                } : 'N/A',
                                waveform: waveformRect ? {
                                  top: waveformRect.top,
                                  bottom: waveformRect.bottom,
                                  height: waveformRect.height
                                } : 'N/A',
                                volumeLine: waveformRect ? {
                                  absoluteTop: waveformRect.top + clampedLineY,
                                  shouldBeBelow: thumbnailRect?.bottom
                                } : 'N/A',
                                gap: thumbnailRect && waveformRect ? waveformRect.top - thumbnailRect.bottom : 'N/A'
                              });
                            }

                            return (
                              <div
                                onMouseDown={(e) => {
                                  if (isHovered) {
                                    handleVolumeMouseDown(e, item.id, track.id);
                                  }
                                }}
                                style={{
                                  position: 'absolute',
                                  top: `${clampedLineY}px`,
                                  left: 0,
                                  width: '100%',
                                  height: '1px',
                                  backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.5)' : 'transparent',
                                  cursor: isHovered ? 'ns-resize' : 'default',
                                  zIndex: 3,
                                  pointerEvents: isHovered ? 'auto' : 'none',
                                }}
                                title={isHovered ? `Volume: ${Math.round(currentVolume * 100)}%` : ''}
                              />
                            );
                          })()}
                        </div>
                      )}

                      {/* Fade curve overlays - at item level */}
                      {hasWaveform && state.selectedItemId === item.id && (
                        <>
                          {renderFadeCurve(
                            item.durationInFrames * pixelsPerFrame,
                            itemHeight,
                            audioFadeIn,
                            'in',
                            pixelsPerFrame,
                            thumbnailHeight
                          )}
                          {renderFadeCurve(
                            item.durationInFrames * pixelsPerFrame,
                            itemHeight,
                            audioFadeOut,
                            'out',
                            pixelsPerFrame,
                            thumbnailHeight
                          )}
                        </>
                      )}

                      {/* Audio Fade Effects with Handles */}
                      {hasWaveform && hoveredItemId === item.id && (
                        <>
                          {/* Audio Fade In Handle - Circle at top */}
                          <div
                            onMouseDown={(e) => handleFadeMouseDown(e, item.id, track.id, 'in')}
                            onDragStart={(e) => e.preventDefault()}
                            style={{
                              position: 'absolute',
                              left: `${audioFadeIn * pixelsPerFrame - 6}px`,
                              top: hasWaveform ? `${thumbnailHeight - 6}px` : '-6px',
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              backgroundColor: '#fff',
                              border: '2px solid #0066ff',
                              cursor: 'ew-resize',
                              zIndex: 30,
                              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                              pointerEvents: 'auto',
                            }}
                            title={`Fade In: ${(audioFadeIn / state.fps).toFixed(1)}s`}
                          >
                            {/* Show time label while dragging */}
                            {draggingFade?.itemId === item.id && draggingFade?.type === 'in' && (
                              <div style={{
                                position: 'absolute',
                                top: '-24px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                backgroundColor: 'rgba(0,0,0,0.9)',
                                color: '#fff',
                                padding: '2px 6px',
                                borderRadius: '3px',
                                fontSize: '11px',
                                whiteSpace: 'nowrap',
                                pointerEvents: 'none',
                              }}>
                                {(audioFadeIn / state.fps).toFixed(2)}s
                              </div>
                            )}
                          </div>

                          {/* Audio Fade Out Handle - Circle at top */}
                          <div
                            onMouseDown={(e) => handleFadeMouseDown(e, item.id, track.id, 'out')}
                            onDragStart={(e) => e.preventDefault()}
                            style={{
                              position: 'absolute',
                              right: `${audioFadeOut * pixelsPerFrame - 6}px`,
                              top: hasWaveform ? `${thumbnailHeight - 6}px` : '-6px',
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              backgroundColor: '#fff',
                              border: '2px solid #0066ff',
                              cursor: 'ew-resize',
                              zIndex: 30,
                              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                              pointerEvents: 'auto',
                            }}
                            title={`Fade Out: ${(audioFadeOut / state.fps).toFixed(1)}s`}
                          >
                            {/* Show time label while dragging */}
                            {draggingFade?.itemId === item.id && draggingFade?.type === 'out' && (
                              <div style={{
                                position: 'absolute',
                                top: '-24px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                backgroundColor: 'rgba(0,0,0,0.9)',
                                color: '#fff',
                                padding: '2px 6px',
                                borderRadius: '3px',
                                fontSize: '11px',
                                whiteSpace: 'nowrap',
                                pointerEvents: 'none',
                              }}>
                                {(audioFadeOut / state.fps).toFixed(2)}s
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      <span style={{
                        ...styles.itemLabel,
                        backgroundColor: hasPreview ? 'rgba(0, 0, 0, 0.7)' : 'transparent',
                        padding: hasPreview ? '2px 6px' : '0',
                        borderRadius: hasPreview ? '3px' : '0',
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        zIndex: 1,
                      }}>
                        {getItemLabel(item)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      </div>

      {/* Add Track Button */}
      <div style={styles.footer}>
        <button
          onClick={() => {
            const newTrack: Track = {
              id: `track-${Date.now()}`,
              name: `Track ${state.tracks.length + 1}`,
              items: [],
            };
            dispatch({ type: 'ADD_TRACK', payload: newTrack });
          }}
          style={styles.addButton}
        >
          + Add Track
        </button>
      </div>
    </div>
    </>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#1e1e1e',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: '#2d2d2d',
    borderBottom: '1px solid #3d3d3d',
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: '#ffffff',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  button: {
    padding: '4px 12px',
    backgroundColor: '#3d3d3d',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  snapButton: {
    width: '32px',
    height: '32px',
    padding: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3d3d3d',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  zoomControl: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  zoomButton: {
    width: '28px',
    height: '28px',
    padding: '0',
    backgroundColor: '#3d3d3d',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '18px',
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
  },
  timeLabel: {
    fontSize: '14px',
    color: '#ffffff',
    fontFamily: 'monospace',
  },
  timeline: {
    flex: 1,
    overflowX: 'auto',
    overflowY: 'auto',
    position: 'relative',
  },
  ruler: {
    display: 'flex',
    height: '40px',
    backgroundColor: '#2d2d2d',
    borderBottom: '1px solid #3d3d3d',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  rulerLabel: {
    display: 'flex',
    alignItems: 'center',
    paddingLeft: '16px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#ffffff',
    borderRight: '1px solid #3d3d3d',
  },
  rulerTicks: {
    flex: 1,
    position: 'relative',
  },
  rulerTick: {
    position: 'absolute',
    top: 0,
    height: '100%',
  },
  rulerTickMark: {
    width: '1px',
    height: '8px',
    backgroundColor: '#666666',
  },
  rulerTickLabel: {
    fontSize: '11px',
    color: '#aaaaaa',
    marginTop: '4px',
    fontFamily: 'monospace',
  },
  tracks: {
    position: 'relative',
  },
  track: {
    display: 'flex',
    height: '80px',
    borderBottom: '1px solid #3d3d3d',
    cursor: 'pointer',
  },
  trackLabel: {
    width: '200px',
    display: 'flex',
    alignItems: 'center',
    paddingLeft: '16px',
    borderRight: '1px solid #3d3d3d',
    cursor: 'grab',
    userSelect: 'none',
  },
  trackName: {
    fontSize: '14px',
    color: '#ffffff',
    fontWeight: 500,
  },
  trackContent: {
    flex: 1,
    position: 'relative',
  },
  item: {
    position: 'absolute',
    top: '8px',
    height: '44px',
    borderRadius: '4px',
    cursor: 'move',
    display: 'flex',
    alignItems: 'center',
    paddingLeft: '8px',
    overflow: 'hidden',
  },
  itemLabel: {
    fontSize: '12px',
    color: '#ffffff',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  footer: {
    padding: '12px 16px',
    backgroundColor: '#2d2d2d',
    borderTop: '1px solid #3d3d3d',
  },
  addButton: {
    padding: '8px 16px',
    backgroundColor: '#0066ff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  },
};
