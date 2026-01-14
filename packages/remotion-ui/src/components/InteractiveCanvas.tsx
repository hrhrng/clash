import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { VideoComposition } from '@remotion-fast/remotion-components';
import type { Track, Item, ItemProperties } from '@remotion-fast/core';
import { findTopItemAtPoint } from './canvas/hitTest';

interface InteractiveCanvasProps {
  tracks: Track[];
  selectedItemId: string | null;
  currentFrame: number;
  compositionWidth: number;
  compositionHeight: number;
  fps: number;
  durationInFrames: number;
  onUpdateItem: (trackId: string, itemId: string, updates: Partial<Item>) => void;
  onSelectItem?: (itemId: string | null) => void;
  playing?: boolean;
  onSeek?: (frame: number) => void;
  onFrameUpdate?: (frame: number) => void;
  onPlayingChange?: (playing: boolean) => void;
}

type DragMode = 'move' | 'rotate' | 'scale-tl' | 'scale-tr' | 'scale-bl' | 'scale-br' | null;

interface DragState {
  mode: DragMode;
  startX: number;
  startY: number;
  startProperties: ItemProperties;
  item: Item;
  trackId: string;
}

export const InteractiveCanvas: React.FC<InteractiveCanvasProps> = ({
  tracks,
  selectedItemId,
  currentFrame,
  compositionWidth,
  compositionHeight,
  fps,
  durationInFrames,
  onUpdateItem,
  onSelectItem,
  playing = false,
  onSeek,
  onFrameUpdate,
  onPlayingChange,
}) => {
  const playerRef = useRef<PlayerRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectionBoxRef = useRef<HTMLDivElement>(null);
  const itemsDomMapRef = useRef<Map<string, HTMLElement>>(new Map());
  const itemBoundsCache = useRef<Map<string, DOMRect>>(new Map());
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoverHandle, setHoverHandle] = useState<DragMode>(null);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [, forceUpdate] = useState({});

  // 找到选中的 item
  const selectedItemData = selectedItemId
    ? tracks
        .flatMap((t) => t.items.map((i) => ({ trackId: t.id, item: i })))
        .find((x) => x.item.id === selectedItemId)
    : null;

  // 自动初始化 properties（如果不存在）
  useEffect(() => {
    if (selectedItemData && !selectedItemData.item.properties) {
      console.log('[InteractiveCanvas] Auto-initializing properties for item:', selectedItemData.item.id);
      const defaultProperties: ItemProperties = {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
        opacity: 1,
      };
      onUpdateItem(selectedItemData.trackId, selectedItemData.item.id, {
        properties: defaultProperties,
      });
    }
  }, [selectedItemData, onUpdateItem]);

  // 检查 item 是否在当前帧可见
  const isItemVisible = selectedItemData
    ? currentFrame >= selectedItemData.item.from &&
      currentFrame < selectedItemData.item.from + selectedItemData.item.durationInFrames
    : false;

  // 调试日志
  useEffect(() => {
    if (selectedItemData) {
      console.log('[InteractiveCanvas] Selected item:', {
        id: selectedItemData.item.id,
        from: selectedItemData.item.from,
        to: selectedItemData.item.from + selectedItemData.item.durationInFrames,
        currentFrame,
        isVisible: isItemVisible,
        hasProperties: !!selectedItemData.item.properties,
        properties: selectedItemData.item.properties,
      });
    }
  }, [selectedItemData, currentFrame, isItemVisible]);

  // 准备 Player 的 inputProps
  const inputProps = React.useMemo(() => ({
    tracks,
    selectedItemId,
    selectionBoxRef,
    itemsDomMapRef,
  }), [tracks, selectedItemId]);

  // 同步播放状态
  useEffect(() => {
    if (playerRef.current) {
      if (playing) {
        playerRef.current.play();
      } else {
        playerRef.current.pause();
      }
    }
  }, [playing]);

  // 同步当前帧
  useEffect(() => {
    if (playerRef.current && !playing) {
      playerRef.current.seekTo(currentFrame);
    }
  }, [currentFrame, playing]);

  // 监听 Player 事件
  useEffect(() => {
    const player = playerRef.current as any;
    if (!player) return;

    const handleFrame = () => {
      const frame = player.getCurrentFrame();
      if (onFrameUpdate) {
        onFrameUpdate(frame);
      }
    };

    const handlePlay = () => {
      if (onPlayingChange) {
        onPlayingChange(true);
      }
    };

    const handlePause = () => {
      if (onPlayingChange) {
        onPlayingChange(false);
      }
    };

    player.addEventListener('frameupdate', handleFrame);
    player.addEventListener('play', handlePlay);
    player.addEventListener('pause', handlePause);

    return () => {
      player.removeEventListener('frameupdate', handleFrame);
      player.removeEventListener('play', handlePlay);
      player.removeEventListener('pause', handlePause);
    };
  }, [onFrameUpdate, onPlayingChange]);

  // 处理缩放
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev * 1.2, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev / 1.2, 0.1));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  // 处理滚轮缩放
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      // Cmd/Ctrl + 滚轮：缩放
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.95 : 1.05;
        setZoom((prev) => Math.max(0.1, Math.min(5, prev * delta)));
      }
    },
    []
  );

  // 绑定滚轮事件
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  // 监听窗口 resize，强制更新 bounds
  useEffect(() => {
    const handleResize = () => {
      forceUpdate({});
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // 坐标转换：从屏幕坐标到 composition 坐标
  const screenToComposition = useCallback(
    (screenX: number, screenY: number): { x: number; y: number } => {
      if (!containerRef.current) return { x: 0, y: 0 };

      const rect = containerRef.current.getBoundingClientRect();
      const aspectRatio = compositionWidth / compositionHeight;

      // 计算 Player 的实际尺寸（按宽高比居中）
      let playerWidth, playerHeight, playerOffsetX, playerOffsetY;
      if (aspectRatio > rect.width / rect.height) {
        playerWidth = rect.width;
        playerHeight = rect.width / aspectRatio;
        playerOffsetX = 0;
        playerOffsetY = (rect.height - playerHeight) / 2;
      } else {
        playerHeight = rect.height;
        playerWidth = rect.height * aspectRatio;
        playerOffsetX = (rect.width - playerWidth) / 2;
        playerOffsetY = 0;
      }
      
      // 相对于容器的坐标
      const relX = screenX - rect.left;
      const relY = screenY - rect.top;

      // 相对于 Player 中心的像素偏移
      const centerX = relX - playerOffsetX - playerWidth / 2;
      const centerY = relY - playerOffsetY - playerHeight / 2;

      return { x: centerX, y: centerY };
    },
    [compositionWidth, compositionHeight]
  );

  // 处理画布平移
  const handleCanvasPan = useCallback(
    (e: React.MouseEvent) => {
      // 空格键 + 拖拽：平移画布
      if (e.buttons === 1 && e.currentTarget === e.target) {
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
          e.preventDefault();
          setIsPanning(true);
          setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
        }
      }
    },
    [panOffset]
  );

  const handlePanMove = useCallback(
    (e: MouseEvent) => {
      if (isPanning) {
        setPanOffset({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
      }
    },
    [isPanning, panStart]
  );

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  // 绑定平移事件
  useEffect(() => {
    if (isPanning) {
      window.addEventListener('mousemove', handlePanMove);
      window.addEventListener('mouseup', handlePanEnd);
      return () => {
        window.removeEventListener('mousemove', handlePanMove);
        window.removeEventListener('mouseup', handlePanEnd);
      };
    }
  }, [isPanning, handlePanMove, handlePanEnd]);

  // 处理鼠标按下
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, mode: DragMode) => {
      if (!selectedItemData) return;

      e.preventDefault();
      e.stopPropagation();

      const { x, y } = screenToComposition(e.clientX, e.clientY);

      setDragState({
        mode,
        startX: x,
        startY: y,
        startProperties: {
          x: selectedItemData.item.properties?.x ?? 0,
          y: selectedItemData.item.properties?.y ?? 0,
          width: selectedItemData.item.properties?.width ?? 1,
          height: selectedItemData.item.properties?.height ?? 1,
          rotation: selectedItemData.item.properties?.rotation ?? 0,
          opacity: selectedItemData.item.properties?.opacity ?? 1,
        },
        item: selectedItemData.item,
        trackId: selectedItemData.trackId,
      });
    },
    [selectedItemData, screenToComposition]
  );

  // 处理鼠标移动
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragState) return;

      const { x, y } = screenToComposition(e.clientX, e.clientY);
      const deltaX = x - dragState.startX;
      const deltaY = y - dragState.startY;

      const newProperties: Partial<ItemProperties> = { ...dragState.startProperties };

      switch (dragState.mode) {
        case 'move':
          // 移动
          newProperties.x = dragState.startProperties.x + deltaX;
          newProperties.y = dragState.startProperties.y + deltaY;
          break;

        case 'scale-tl':
        case 'scale-tr':
        case 'scale-bl':
        case 'scale-br':
          // 缩放（简化版，等比缩放）
          const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          const direction = dragState.mode.includes('br') || dragState.mode.includes('tr') ? 1 : -1;
          const scaleFactor = 1 + (direction * distance) / 200;
          newProperties.width = Math.max(0.1, dragState.startProperties.width * scaleFactor);
          newProperties.height = Math.max(0.1, dragState.startProperties.height * scaleFactor);
          break;

        case 'rotate':
          // 旋转
          const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
          newProperties.rotation = angle;
          break;
      }

      // 更新 item properties
      onUpdateItem(dragState.trackId, dragState.item.id, {
        properties: newProperties as ItemProperties,
      });
    },
    [dragState, screenToComposition, onUpdateItem]
  );

  // 处理鼠标释放
  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  // 绑定全局鼠标事件
  useEffect(() => {
    if (dragState) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState, handleMouseMove, handleMouseUp]);

  // 直接从 DOM 获取选择框的位置
  const getItemBounds = useCallback(() => {
    if (!selectedItemData || !selectionBoxRef.current || !containerRef.current) return null;
    if (!isItemVisible) return null;

    const props = selectedItemData.item.properties;
    if (!props) return null;

    // 获取选择框和容器的视口坐标
    const rect = selectionBoxRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    
    // 转换为相对于容器的坐标
    const left = rect.left - containerRect.left;
    const top = rect.top - containerRect.top;
    const centerX = left + rect.width / 2;
    const centerY = top + rect.height / 2;

    console.log('[getItemBounds]:', { 
      left, 
      top, 
      width: rect.width, 
      height: rect.height,
      centerX,
      centerY,
      rotation: props.rotation ?? 0,
    });

    return {
      left,
      top,
      width: rect.width,
      height: rect.height,
      centerX,
      centerY,
      rotation: props.rotation ?? 0,
    };
  }, [selectedItemData, isItemVisible]);

  // 使用真实 DOM 位置计算（与 getItemBounds 完全一致）
  const getItemScreenPosition = useCallback((item: Item) => {
    if (!item?.id) return null;
    const containerEl = containerRef.current;
    if (!containerEl) return null;

    // 直接拿子层回填的真实 DOM
    const el = itemsDomMapRef.current.get(item.id);
    if (!el) return null;

    const rect = el.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();

    const left = rect.left - containerRect.left;
    const top = rect.top - containerRect.top;
    const width = rect.width;
    const height = rect.height;

    return {
      left,
      top,
      width,
      height,
      centerX: left + width / 2,
      centerY: top + height / 2,
      rotation: item.properties?.rotation ?? 0, // 仅记录；AABB 已含旋转效果
    };
  }, [itemsDomMapRef]);

  const bounds = getItemBounds();

  // 统一的指针按下处理（同时处理选中和拖动）
  const handlePointerDown = useCallback(
    (e: React.MouseEvent) => {
      if (!onSelectItem) return;
      
      // 如果点击的是控制手柄或缩放按钮，跳过
      const target = e.target as HTMLElement;
      if (target.closest('.control-handle') || target.closest('.zoom-controls')) {
        return;
      }

      // 只处理直接点击 Player 区域的事件
      // 排除点击其他 UI 元素（如按钮等）
      if (target.tagName === 'BUTTON' || target.closest('button')) {
        return;
      }

      const { x, y } = screenToComposition(e.clientX, e.clientY);
      
      console.log('[InteractiveCanvas] Click at:', { x, y });
      
      // 查找点击位置最上层的元素
      const hitTarget = findTopItemAtPoint(
        x,
        y,
        tracks,
        currentFrame,
        compositionWidth,
        compositionHeight
      );

      if (hitTarget) {
        // 找到元素：选中并准备拖动
        console.log('[InteractiveCanvas] Clicked item:', hitTarget.itemId);
        if (selectedItemId !== hitTarget.itemId) {
          onSelectItem(hitTarget.itemId);
        }
        
        // 查找完整的 item 数据准备拖动
        const itemData = tracks
          .flatMap((t) => t.items.map((i) => ({ trackId: t.id, item: i })))
          .find((x) => x.item.id === hitTarget.itemId);
        
        if (itemData) {
          e.preventDefault();
          e.stopPropagation();
          
          setDragState({
            mode: 'move',
            startX: x,
            startY: y,
            startProperties: {
              x: itemData.item.properties?.x ?? 0,
              y: itemData.item.properties?.y ?? 0,
              width: itemData.item.properties?.width ?? 1,
              height: itemData.item.properties?.height ?? 1,
              rotation: itemData.item.properties?.rotation ?? 0,
              opacity: itemData.item.properties?.opacity ?? 1,
            },
            item: itemData.item,
            trackId: itemData.trackId,
          });
        }
      } else {
        // 没找到元素：取消选中
        console.log('[InteractiveCanvas] Clicked empty area, deselecting');
        onSelectItem(null);
      }
    },
    [
      tracks,
      currentFrame,
      compositionWidth,
      compositionHeight,
      selectedItemId,
      onSelectItem,
      screenToComposition,
    ]
  );

  // 计算画布的实际显示尺寸（保持宽高比）
  const aspectRatio = compositionWidth / compositionHeight;

  return (
    <div style={styles.container}>
      {/* 缩放控制按钮 */}
      <div className="zoom-controls" style={styles.zoomControls}>
        <button onClick={handleZoomOut} style={styles.zoomButton} title="缩小 (Cmd/Ctrl + 滚轮)">
          −
        </button>
        <span style={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
        <button onClick={handleZoomIn} style={styles.zoomButton} title="放大 (Cmd/Ctrl + 滚轮)">
          +
        </button>
        <button onClick={handleResetZoom} style={styles.resetButton} title="重置">
          ⟲
        </button>
      </div>

      {/* Remotion Player - 底层渲染 */}
      <div 
        ref={containerRef} 
        style={{
          ...styles.playerWrapper,
          cursor: isPanning ? 'grabbing' : 'default',
        }}
        onMouseDown={(e) => {
          handleCanvasPan(e);
          // 点击空白区域取消选中
          // 如果点击的是元素或控制手柄，他们会 stopPropagation，不会到达这里
          console.log('[InteractiveCanvas] Clicked empty area, deselecting');
          onSelectItem?.(null);
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: aspectRatio > 1 ? '100%' : `${aspectRatio * 100}%`,
              height: aspectRatio > 1 ? `${(1 / aspectRatio) * 100}%` : '100%',
              transform: `scale(${zoom}) translate(${panOffset.x / zoom}px, ${panOffset.y / zoom}px)`,
              transformOrigin: 'center center',
            }}
          >
            <Player
              key={`player-${compositionWidth}-${compositionHeight}`}
              ref={playerRef}
              component={VideoComposition}
              compositionWidth={compositionWidth}
              compositionHeight={compositionHeight}
              durationInFrames={durationInFrames}
              fps={fps}
              inputProps={inputProps}
              style={styles.player}
              controls={false}
              loop={false}
            />
            
          </div>
        </div>
        
        {/* 交互层1 - 所有可见元素的透明点击区域 */}
        <svg 
          className="canvas-items"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'all',
            zIndex: 1000,
          }}
        >
          {/* 全屏透明背景，用于捕获空白点击 */}
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="transparent"
            style={{ pointerEvents: 'all' }}
            onMouseDown={(e) => {
              console.log('[InteractiveCanvas] Clicked empty background, deselecting');
              onSelectItem?.(null);
            }}
          />
          
          {/* 为每个可见元素渲染透明点击区域 */}
          {tracks.flatMap((track) =>
            track.items
              .filter((item) => 
                item.properties &&
                currentFrame >= item.from &&
                currentFrame < item.from + item.durationInFrames
              )
              .map((item) => {
                if (!item.properties) return null;
                
                // 使用统一的计算逻辑
                const itemBounds = getItemScreenPosition(item);
                if (!itemBounds) return null;
                
                return (
                  <rect
                    key={item.id}
                    className="item-clickable"
                    x={itemBounds.left}
                    y={itemBounds.top}
                    width={itemBounds.width}
                    height={itemBounds.height}
                    fill="transparent"
                    style={{
                      pointerEvents: 'all',
                      cursor: 'pointer',
                      // 不要再加旋转，因为 DOM 已经旋转过了！
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      
                      // 选中该元素（如果未选中）
                      if (onSelectItem && selectedItemId !== item.id) {
                        onSelectItem(item.id);
                      }
                      
                      // 准备拖动
                      const { x, y } = screenToComposition(e.clientX, e.clientY);
                      setDragState({
                        mode: 'move',
                        startX: x,
                        startY: y,
                        startProperties: {
                          x: item.properties?.x ?? 0,
                          y: item.properties?.y ?? 0,
                          width: item.properties?.width ?? 1,
                          height: item.properties?.height ?? 1,
                          rotation: item.properties?.rotation ?? 0,
                          opacity: item.properties?.opacity ?? 1,
                        },
                        item: item,
                        trackId: track.id,
                      });
                    }}
                  />
                );
              })
          )}
        </svg>
        
        {/* 交互层2 - 选中元素的蓝框和控制手柄 */}
        {bounds && selectedItemData && (
          <svg 
            className="canvas-controls"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 1001,
            }}
          >
          {/* 蓝色边框 */}
          <rect
            className="control-handle"
            x={bounds.left}
            y={bounds.top}
            width={bounds.width}
            height={bounds.height}
            fill="none"
            stroke="#0066ff"
            strokeWidth="2"
            style={{
              pointerEvents: 'none',
            }}
          />
          
          {/* 透明的拖拽区域（选中时覆盖在透明层上方，优先响应） */}
          <rect
            className="control-handle"
            x={bounds.left}
            y={bounds.top}
            width={bounds.width}
            height={bounds.height}
            fill="transparent"
            style={{
              transform: `rotate(${bounds.rotation}deg)`,
              transformOrigin: `${bounds.centerX}px ${bounds.centerY}px`,
              cursor: 'move',
              pointerEvents: 'all',
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleMouseDown(e as any, 'move');
            }}
          />

            {/* 四个角的缩放手柄 */}
            {[
              { pos: 'tl', x: bounds.left, y: bounds.top },
              { pos: 'tr', x: bounds.left + bounds.width, y: bounds.top },
              { pos: 'bl', x: bounds.left, y: bounds.top + bounds.height },
              { pos: 'br', x: bounds.left + bounds.width, y: bounds.top + bounds.height },
            ].map(({ pos, x, y }) => (
              <circle
                key={pos}
                className="control-handle"
                cx={x}
                cy={y}
                r="6"
                fill="#ffffff"
                stroke="#0066ff"
                strokeWidth="2"
                style={{
                  pointerEvents: 'all',
                  cursor: `${pos.includes('t') ? 'n' : 's'}${pos.includes('l') ? 'w' : 'e'}-resize`,
                  transform: `rotate(${bounds.rotation}deg)`,
                  transformOrigin: `${bounds.centerX}px ${bounds.centerY}px`,
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleMouseDown(e as any, `scale-${pos}` as DragMode);
                }}
                onMouseEnter={() => setHoverHandle(`scale-${pos}` as DragMode)}
                onMouseLeave={() => setHoverHandle(null)}
              />
            ))}

            {/* 旋转手柄 */}
            <circle
              className="control-handle"
              cx={bounds.centerX}
              cy={bounds.top - 30}
              r="6"
              fill="#ffffff"
              stroke="#0066ff"
              strokeWidth="2"
              style={{
                pointerEvents: 'all',
                cursor: 'crosshair',
                transform: `rotate(${bounds.rotation}deg)`,
                transformOrigin: `${bounds.centerX}px ${bounds.centerY}px`,
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                handleMouseDown(e as any, 'rotate');
              }}
              onMouseEnter={() => setHoverHandle('rotate')}
              onMouseLeave={() => setHoverHandle(null)}
            />
            <line
              className="control-handle"
              x1={bounds.centerX}
              y1={bounds.top}
              x2={bounds.centerX}
              y2={bounds.top - 30}
              stroke="#0066ff"
              strokeWidth="2"
              style={{
                transform: `rotate(${bounds.rotation}deg)`,
                transformOrigin: `${bounds.centerX}px ${bounds.centerY}px`,
                pointerEvents: 'none',
              }}
            />
          </svg>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  playerWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  player: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'all',
    userSelect: 'none',
  },
  zoomControls: {
    position: 'absolute',
    top: 16,
    right: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: '8px 12px',
    borderRadius: 8,
    zIndex: 1000,
  },
  zoomButton: {
    width: 28,
    height: 28,
    border: 'none',
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
  },
  resetButton: {
    width: 28,
    height: 28,
    border: 'none',
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    color: 'white',
    fontSize: 16,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
  },
  zoomLabel: {
    color: 'white',
    fontSize: 12,
    fontWeight: 500,
    minWidth: 45,
    textAlign: 'center',
  },
};
