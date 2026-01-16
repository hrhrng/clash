import React, { useRef, useState } from 'react';
import { useEditor } from '@master-clash/remotion-core';
import type { Asset, TextItem } from '@master-clash/remotion-core';

// Export for TimelineTracksContainer to use
export let currentDraggedAsset: any = null;
export let currentAssetDragOffset: number = 0; // 鼠标相对于 asset 卡片左边缘的偏移量（像素）

type AssetPanelProps = {
  onBack?: () => void;
  backLabel?: string;
  onAssetUpload?: (file: File, type: 'video' | 'image' | 'audio') => void;
  availableAssets?: Array<{
    id: string;
    name?: string;
    type: 'video' | 'image' | 'audio';
    src: string;
    width?: number;
    height?: number;
    sourceNodeId?: string;
  }>;
  onAssetPicked?: (asset: {
    id: string;
    name?: string;
    type: 'video' | 'image' | 'audio';
    src: string;
    width?: number;
    height?: number;
    sourceNodeId?: string;
  }) => void;
};

export const AssetPanel: React.FC<AssetPanelProps> = ({
  onBack,
  backLabel = '返回',
  onAssetUpload,
  availableAssets = [],
  onAssetPicked,
}) => {
  const { state, dispatch } = useEditor();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const type = file.type.startsWith('video')
        ? 'video'
        : file.type.startsWith('audio')
          ? 'audio'
          : file.type.startsWith('image')
            ? 'image'
            : null;

      if (!type) continue;
      if (!onAssetUpload) {
        console.warn('[AssetPanel] onAssetUpload not provided; skipping upload.');
        continue;
      }

      onAssetUpload(file, type);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAssetDragStart = (e: React.DragEvent, asset: Asset) => {
    currentDraggedAsset = asset; // Store globally

    // 计算鼠标相对于 asset 卡片左边缘的偏移量
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    currentAssetDragOffset = e.clientX - rect.left;

    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', asset.id); // Use text/plain for better compatibility
    e.dataTransfer.setData('assetId', asset.id);
    e.dataTransfer.setData('asset', JSON.stringify(asset));
  };

  const handleAddTextToTrack = () => {
    const newItemDuration = 90; // 3 seconds at 30fps
    const newItemFrom = state.currentFrame;
    const newItemTo = newItemFrom + newItemDuration;

    // 检测第一轨道是否有重叠
    let trackId: string;
    let needsNewTrack = false;

    if (state.tracks.length === 0) {
      // 没有轨道，创建新轨道
      trackId = `track-${Date.now()}`;
      needsNewTrack = true;
    } else {
      const firstTrack = state.tracks[0];
      // 检查第一轨道上是否有元素与新元素时间范围重叠
      const hasOverlap = firstTrack.items.some(item => {
        const itemFrom = item.from;
        const itemTo = item.from + item.durationInFrames;
        // 两个时间范围重叠的条件：newItemFrom < itemTo && newItemTo > itemFrom
        return newItemFrom < itemTo && newItemTo > itemFrom;
      });

      if (hasOverlap) {
        // 有重叠，创建新轨道并插入到第一位置
        trackId = `track-${Date.now()}`;
        needsNewTrack = true;
      } else {
        // 无重叠，使用第一轨道
        trackId = firstTrack.id;
      }
    }

    // 如果需要新轨道，先创建
    if (needsNewTrack) {
      dispatch({
        type: 'INSERT_TRACK',
        payload: {
          track: {
            id: trackId,
            name: 'Text',
            items: [],
          },
          index: 0, // 插入到第一位置
        }
      });
    }

    // 创建 text item
    const textItem: TextItem = {
      id: `text-${Date.now()}`,
      type: 'text',
      text: 'Double click to edit',
      color: '#ffffff',
      from: newItemFrom,
      durationInFrames: newItemDuration,
      fontSize: 60,
      properties: {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
        opacity: 1,
      },
    };

    // 使用 setTimeout 确保轨道先创建
    setTimeout(() => {
      dispatch({
        type: 'ADD_ITEM',
        payload: { trackId, item: textItem },
      });
    }, 0);
  };

  // Handle dragging Quick Add items
  const handleQuickAddDragStart = (e: React.DragEvent, type: 'text' | 'solid') => {
    // Create a pseudo-asset for quick add items
    const pseudoAsset = {
      id: `quick-${type}-${Date.now()}`,
      name: type === 'text' ? 'Text' : 'Color',
      type: type as 'text' | 'solid',
      src: '',
      createdAt: Date.now(),
    };

    currentDraggedAsset = { ...pseudoAsset, quickAdd: true, quickAddType: type }; // Store globally

    // 计算鼠标相对于按钮左边缘的偏移量
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    currentAssetDragOffset = e.clientX - rect.left;

    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', pseudoAsset.id); // Use text/plain for compatibility
    e.dataTransfer.setData('assetId', pseudoAsset.id);
    e.dataTransfer.setData('quickAdd', 'true');
    e.dataTransfer.setData('quickAddType', type);
  };

  const handlePickAsset = (asset: {
    id: string;
    name?: string;
    type: 'video' | 'image' | 'audio';
    src: string;
    width?: number;
    height?: number;
    sourceNodeId?: string;
  }) => {
    const exists = state.assets.some((a) =>
      a.id === asset.id ||
      a.src === asset.src ||
      (asset.sourceNodeId && a.sourceNodeId === asset.sourceNodeId)
    );

    if (!exists) {
      dispatch({
        type: 'ADD_ASSET',
        payload: {
          id: asset.id,
          name: asset.name || 'Canvas Asset',
          type: asset.type,
          src: asset.src,
          width: asset.width,
          height: asset.height,
          createdAt: Date.now(),
          readOnly: true,
          sourceNodeId: asset.sourceNodeId,
        },
      });
    }
    onAssetPicked?.(asset);
    setIsPickerOpen(false);
  };

  return (

    <div className="relative flex flex-col h-full bg-slate-50">
      <div className="px-4 py-3 bg-white border-b border-slate-200">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 text-white shadow-sm transition-colors hover:bg-slate-800"
            aria-label={backLabel}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M10.5 6.5L5 12l5.5 5.5M6 12h13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : (
          <h2 className="m-0 text-sm font-bold text-slate-900">Assets</h2>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* Quick Add Section */}
        <div className="mb-6">
          <h3 className="m-0 mb-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Quick Add</h3>
          <div className="flex gap-2">
            <button
              onClick={handleAddTextToTrack}
              className="flex-1 py-2 px-3 bg-white text-slate-700 border border-slate-200 rounded-lg text-sm font-medium hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all cursor-grab active:cursor-grabbing shadow-sm"
              draggable
              onDragStart={(e) => handleQuickAddDragStart(e, 'text')}
              title="Click to add or drag to timeline"
            >
              + Text
            </button>
            <button
              onClick={() => {
                const newItemDuration = 30; // 1 second at 30fps (smaller initial size)
                const newItemFrom = state.currentFrame;
                const newItemTo = newItemFrom + newItemDuration;

                // 检测第一轨道是否有重叠
                let trackId: string;
                let needsNewTrack = false;

                if (state.tracks.length === 0) {
                  // 没有轨道，创建新轨道
                  trackId = `track-${Date.now()}`;
                  needsNewTrack = true;
                } else {
                  const firstTrack = state.tracks[0];
                  // 检查第一轨道上是否有元素与新元素时间范围重叠
                  const hasOverlap = firstTrack.items.some(item => {
                    const itemFrom = item.from;
                    const itemTo = item.from + item.durationInFrames;
                    // 两个时间范围重叠的条件：newItemFrom < itemTo && newItemTo > itemFrom
                    return newItemFrom < itemTo && newItemTo > itemFrom;
                  });

                  if (hasOverlap) {
                    // 有重叠，创建新轨道并插入到第一位置
                    trackId = `track-${Date.now()}`;
                    needsNewTrack = true;
                  } else {
                    // 无重叠，使用第一轨道
                    trackId = firstTrack.id;
                  }
                }

                // 如果需要新轨道，先创建
                if (needsNewTrack) {
                  dispatch({
                    type: 'INSERT_TRACK',
                    payload: {
                      track: {
                        id: trackId,
                        name: 'Solid',
                        items: [],
                      },
                      index: 0, // 插入到第一位置
                    }
                  });
                }

                // 创建 solid item
                const solidItem = {
                  id: `solid-${Date.now()}`,
                  type: 'solid' as const,
                  color: '#' + Math.floor(Math.random() * 16777215).toString(16),
                  from: newItemFrom,
                  durationInFrames: newItemDuration,
                  properties: {
                    x: 0,
                    y: 0,
                    width: 1,
                    height: 1,
                    rotation: 0,
                    opacity: 1,
                  },
                };

                // 使用 setTimeout 确保轨道先创建
                setTimeout(() => {
                  dispatch({
                    type: 'ADD_ITEM',
                    payload: {
                      trackId,
                      item: solidItem,
                    },
                  });
                }, 0);
              }}
              className="flex-1 py-2 px-3 bg-white text-slate-700 border border-slate-200 rounded-lg text-sm font-medium hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all cursor-grab active:cursor-grabbing shadow-sm"
              draggable
              onDragStart={(e) => handleQuickAddDragStart(e, 'solid')}
              title="Click to add or drag to timeline"
            >
              + Color
            </button>
          </div>
        </div>

        {/* Upload Section */}
        <div className="mb-6">
          <h3 className="m-0 mb-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Media Files</h3>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,audio/*"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm hover:shadow active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!onAssetUpload}
          >
            Upload Files
          </button>
          <button
            onClick={() => setIsPickerOpen(true)}
            className="mt-2 w-full py-2 px-4 bg-white text-slate-700 rounded-lg text-sm font-semibold border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            disabled={availableAssets.length === 0}
          >
            Add From Canvas
          </button>
        </div>

        {/* Assets List */}
        <div className="flex flex-col gap-2">
          {state.assets.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm bg-slate-100/50 rounded-lg border border-dashed border-slate-200">
              No assets uploaded yet
            </div>
          ) : (
            state.assets.map((asset) => (
              <div
                key={asset.id}
                draggable
                onDragStart={(e) => handleAssetDragStart(e, asset)}
                className="group flex items-center p-2 bg-white border border-slate-200 rounded-lg cursor-move hover:border-blue-400 hover:shadow-sm transition-all gap-3 overflow-hidden"
              >
                {asset.type === 'image' && (
                  <img
                    src={asset.src}
                    alt={asset.name}
                    className="w-12 h-12 object-cover object-left-top rounded bg-slate-100 border border-slate-100"
                  />
                )}
                {asset.type === 'video' && (
                  <img
                    src={asset.thumbnail || asset.src}
                    alt={asset.name}
                    className="w-12 h-12 object-cover object-left-top rounded bg-slate-100 border border-slate-100"
                  />
                )}
                {asset.type === 'audio' && (
                  <div className="w-12 h-12 flex items-center justify-center bg-slate-100 rounded text-xl border border-slate-200">🎵</div>
                )}
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="text-sm font-medium text-slate-900 truncate" title={asset.name}>
                    {asset.name}
                  </div>
                  <div className="text-xs text-slate-500 capitalize mt-0.5">{asset.type}</div>
                </div>
                {!asset.readOnly && (
                  <button
                    onClick={() => dispatch({ type: 'REMOVE_ASSET', payload: asset.id })}
                    className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                  >
                    ×
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {isPickerOpen && (
        <div className="absolute inset-0 z-20 bg-white/95 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
            <div className="text-sm font-bold text-slate-900">Add From Canvas</div>
            <button
              onClick={() => setIsPickerOpen(false)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Close
            </button>
          </div>
          <div className="p-4 space-y-2 overflow-auto h-[calc(100%-52px)]">
            {availableAssets.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                No available assets
              </div>
            ) : (
              availableAssets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => handlePickAsset(asset)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
                >
                  {asset.type === 'image' ? (
                    <img
                      src={asset.src}
                      alt={asset.name || 'Image'}
                      className="w-12 h-12 object-cover rounded-md bg-slate-100 border border-slate-100"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">
                      {asset.type.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {asset.name || 'Untitled'}
                    </div>
                    <div className="text-xs text-slate-500 capitalize">{asset.type}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
