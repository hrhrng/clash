import React, { useRef } from 'react';
import { useEditor } from '@master-clash/remotion-core';
import type { Asset, TextItem } from '@master-clash/remotion-core';
import { loadAudioWaveform } from '@master-clash/remotion-core';

// Export for TimelineTracksContainer to use
export let currentDraggedAsset: any = null;
export let currentAssetDragOffset: number = 0; // 鼠标相对于 asset 卡片左边缘的偏移量（像素）

export const AssetPanel: React.FC = () => {
  const { state, dispatch } = useEditor();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateVideoThumbnail = (videoUrl: string): Promise<{ thumbnail: string; frameCount: number; frameWidth: number }> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = videoUrl;
      video.crossOrigin = 'anonymous';
      video.preload = 'metadata';

      video.addEventListener('loadedmetadata', async () => {
        try {
          // Note: video.duration reads from container metadata, which may include
          // extra audio beyond the video stream. This can cause a few frames difference
          // compared to professional tools. Users can manually adjust in the timeline.
          const duration = video.duration;

          const frameInterval = 1.0; // 每1秒提取一帧
          const startTime = 0.5; // 从0.5秒开始
          const frameCount = Math.min(Math.floor((duration - startTime) / frameInterval) + 1, 100); // 最多100帧

          const originalFrameWidth = video.videoWidth;
          const originalFrameHeight = video.videoHeight;

          // 设置每一帧的目标宽度（横向裁剪/缩放）
          const targetFrameHeight = 80; // 固定高度
          const targetFrameWidth = Math.floor((originalFrameWidth / originalFrameHeight) * targetFrameHeight);

          // 创建一个宽画布来容纳所有帧
          const canvas = document.createElement('canvas');
          canvas.width = targetFrameWidth * frameCount;
          canvas.height = targetFrameHeight;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            resolve({ thumbnail: videoUrl, frameCount: 1, frameWidth: 1 });
            return;
          }

          // 提取每一帧
          for (let i = 0; i < frameCount; i++) {
            const time = startTime + i * frameInterval;

            // 等待视频跳转到指定时间
            await new Promise<void>((resolveSeek) => {
              const seeked = () => {
                video.removeEventListener('seeked', seeked);
                resolveSeek();
              };
              video.addEventListener('seeked', seeked);
              video.currentTime = Math.min(time, duration - 0.1);
            });

            // 将当前帧缩放并绘制到画布上
            ctx.drawImage(
              video,
              0, 0, originalFrameWidth, originalFrameHeight, // 源区域
              i * targetFrameWidth, 0, targetFrameWidth, targetFrameHeight // 目标区域
            );
          }

          // 将画布转换为blob
          canvas.toBlob((blob) => {
            if (blob) {
              resolve({
                thumbnail: URL.createObjectURL(blob),
                frameCount,
                frameWidth: targetFrameWidth
              });
            } else {
              resolve({ thumbnail: videoUrl, frameCount: 1, frameWidth: 1 });
            }
          }, 'image/jpeg', 0.75);
        } catch (err) {
          console.error('Error generating thumbnail:', err);
          resolve({ thumbnail: videoUrl, frameCount: 1, frameWidth: 1 });
        }
      });

      video.addEventListener('error', () => {
        resolve({ thumbnail: videoUrl, frameCount: 1, frameWidth: 1 }); // fallback on error
      });
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file);
      const type = file.type.startsWith('video')
        ? 'video'
        : file.type.startsWith('audio')
          ? 'audio'
          : 'image';

      let thumbnail: string | undefined;
      let thumbnailFrameCount: number | undefined;
      let thumbnailFrameWidth: number | undefined;
      let waveform: number[] | undefined;
      let duration: number | undefined;

      // Get duration for video/audio
      if (type === 'video' || type === 'audio') {
        try {
          duration = await new Promise<number>((resolve, reject) => {
            const media = document.createElement(type === 'video' ? 'video' : 'audio');
            media.src = url;
            media.addEventListener('loadedmetadata', () => {
              resolve(media.duration);
            });
            media.addEventListener('error', reject);
          });
        } catch (error) {
          console.error('Error getting duration:', error);
        }
      }

      // Generate thumbnail for video
      if (type === 'video') {
        const result = await generateVideoThumbnail(url);
        thumbnail = result.thumbnail;
        thumbnailFrameCount = result.frameCount;
        thumbnailFrameWidth = result.frameWidth;
      }

      // Generate waveform for audio and video
      if (type === 'audio' || type === 'video') {
        try {
          waveform = await loadAudioWaveform(url, 500); // Increased from 100 to 500 for finer granularity
        } catch (error) {
          console.error('Error generating waveform:', error);
        }
      }

      const asset: Asset = {
        id: `asset-${Date.now()}-${Math.random()}`,
        name: file.name,
        type: type as 'video' | 'audio' | 'image',
        src: url,
        duration,
        thumbnail,
        thumbnailFrameCount,
        thumbnailFrameWidth,
        waveform,
        createdAt: Date.now(),
      };

      dispatch({ type: 'ADD_ASSET', payload: asset });
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

  return (

    <div className="flex flex-col h-full bg-slate-50">
      <div className="px-4 py-3 bg-white border-b border-slate-200">
        <h2 className="m-0 text-sm font-bold text-slate-900">Assets</h2>
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
            className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm hover:shadow active:scale-95"
          >
            Upload Files
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
                className="group flex items-center p-2 bg-white border border-slate-200 rounded-lg cursor-move hover:border-blue-400 hover:shadow-sm transition-all gap-3"
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
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{asset.name}</div>
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
    </div>
  );
};
