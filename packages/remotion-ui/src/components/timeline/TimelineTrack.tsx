import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { Track, Asset, Item } from '@remotion-fast/core';
import { TimelineItem } from './TimelineItem';
import { frameToPixels, secondsToFrames } from './utils/timeFormatter';
import { useEditor } from '@remotion-fast/core';

interface TimelineTrackProps {
  track: Track;
  durationInFrames: number;
  pixelsPerFrame: number;
  isSelected: boolean;
  selectedItemId: string | null;
  assets: Asset[];
  onSelectTrack: () => void;
  onSelectItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onUpdateItem: (itemId: string, updates: Partial<Item>) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export const TimelineTrack: React.FC<TimelineTrackProps> = ({
  track,
  durationInFrames,
  pixelsPerFrame,
  isSelected,
  selectedItemId,
  assets,
  onSelectTrack,
  onSelectItem,
  onDeleteItem,
  onUpdateItem,
  onDragOver,
  onDrop,
}) => {
  // Use global editor state for fps so we never assume 30fps in calculations
  const { state } = useEditor();
  const [isHovered, setIsHovered] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(track.name);

  const totalWidth = frameToPixels(durationInFrames, pixelsPerFrame);

  const handleTrackClick = useCallback(() => {
    onSelectTrack();
  }, [onSelectTrack]);

  const handleNameDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsEditingName(true);
      setEditedName(track.name);
    },
    [track.name]
  );

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditedName(e.target.value);
  }, []);

  const handleNameBlur = useCallback(() => {
    setIsEditingName(false);
    // TODO: dispatch action to update track name
    // For now, just close the editor
  }, []);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleNameBlur();
      } else if (e.key === 'Escape') {
        setEditedName(track.name);
        setIsEditingName(false);
      }
    },
    [track.name, handleNameBlur]
  );

  const handleItemResize = useCallback(
    (itemId: string, edge: 'left' | 'right', deltaFrames: number) => {
      const item = track.items.find((i) => i.id === itemId);
      if (!item) return;

      // 获取视频/音频素材的总时长（以帧为单位），用于约束逻辑剪裁
      let totalFramesForAsset: number | undefined;
      if ((item.type === 'video' || item.type === 'audio') && 'src' in item) {
        const asset = assets.find((a) => a.src === item.src);
        if (asset?.duration) {
          totalFramesForAsset = secondsToFrames(asset.duration, state.fps);
        }
      }

      if (edge === 'left') {
        // 调整起点和时长（左侧剪裁：可向左扩展/向右剪入）
        const newFrom = Math.max(0, item.from + deltaFrames);
        const newDuration = item.durationInFrames + (item.from - newFrom);

        // 计算拟应用的 sourceStartInFrames（媒体项才有偏移），用于正确约束最大时长
        const consumed = newFrom - item.from; // <0 表示向左扩展；>0 表示向右剪入
        const currentOffset = ((item as any).sourceStartInFrames || 0);
        const proposedOffset = Math.max(0, currentOffset + consumed);
        const maxDurationWithProposedOffset = (totalFramesForAsset !== undefined)
          ? Math.max(0, totalFramesForAsset - proposedOffset)
          : undefined;

        // 检查最小和最大限制（基于“拟应用偏移”的可用时长），允许向左扩展
        const isValidDuration = newDuration >= 15 &&
          (!maxDurationWithProposedOffset || newDuration <= maxDurationWithProposedOffset);

        if (isValidDuration) {
          onUpdateItem(itemId, {
            from: newFrom,
            durationInFrames: newDuration,
            ...(item.type === 'video' || item.type === 'audio' ? { sourceStartInFrames: proposedOffset } : {}),
          } as any);
        }
      } else {
        // 调整时长（右侧剪裁：向右扩展/向左剪出）
        let newDuration = Math.max(15, item.durationInFrames + deltaFrames);

        // 限制最大时长不超过素材实际可用时长（基于当前偏移）
        if (totalFramesForAsset !== undefined) {
          const currentOffset = ((item as any).sourceStartInFrames || 0);
          const maxDuration = Math.max(0, totalFramesForAsset - currentOffset);
          if (newDuration > maxDuration) newDuration = maxDuration;
        }

        onUpdateItem(itemId, {
          durationInFrames: newDuration,
        });
      }
    },
    [track.items, assets, onUpdateItem]
  );

  return (
    <div
      className={`flex h-[72px] border-b border-slate-200 transition-colors duration-150 ${isSelected ? 'bg-blue-50' : 'bg-white'
        } ${track.hidden ? 'opacity-30' : 'opacity-100'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 轨道标签区域 */}
      <div
        className="w-[200px] shrink-0 bg-slate-50 border-r border-slate-200 p-3 flex flex-col justify-between cursor-pointer"
        onClick={handleTrackClick}
      >
        {/* 轨道名称 */}
        <div>
          {isEditingName ? (
            <input
              type="text"
              value={editedName}
              onChange={handleNameChange}
              onBlur={handleNameBlur}
              onKeyDown={handleNameKeyDown}
              autoFocus
              className="w-full bg-white border border-blue-500 rounded text-slate-900 text-sm font-medium px-1.5 py-1 outline-none"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              onDoubleClick={handleNameDoubleClick}
              className="text-slate-900 text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis select-none"
            >
              {track.name}
            </div>
          )}
        </div>

        {/* 轨道控制按钮 */}
        {isHovered && !isEditingName && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex gap-1 mt-2"
          >
            {/* 静音按钮 */}
            <button
              className="w-6 h-6 bg-white border border-slate-200 rounded text-slate-500 text-xs cursor-pointer flex items-center justify-center hover:border-blue-400 hover:text-blue-500"
              onClick={(e) => {
                e.stopPropagation();
                // TODO: toggle mute
              }}
              title="静音 (M)"
            >
              M
            </button>

            {/* 独奏按钮 */}
            <button
              className="w-6 h-6 bg-white border border-slate-200 rounded text-slate-500 text-xs cursor-pointer flex items-center justify-center hover:border-blue-400 hover:text-blue-500"
              onClick={(e) => {
                e.stopPropagation();
                // TODO: toggle solo
              }}
              title="独奏 (S)"
            >
              S
            </button>

            {/* 锁定按钮 */}
            <button
              className={`w-6 h-6 border rounded text-xs cursor-pointer flex items-center justify-center ${track.locked
                ? 'bg-amber-50 border-amber-200 text-amber-600'
                : 'bg-white border-slate-200 text-slate-500 hover:border-blue-400 hover:text-blue-500'
                }`}
              onClick={(e) => {
                e.stopPropagation();
                // TODO: toggle lock
              }}
              title="锁定 (L)"
            >
              {track.locked ? '🔒' : 'L'}
            </button>
          </motion.div>
        )}
      </div>

      {/* 轨道内容区域 */}
      <div
        className="flex-1 relative h-full overflow-visible"
        onClick={handleTrackClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {/* 直接渲染素材项，不需要额外包装 */}
        {track.items.map((item) => (
          <TimelineItem
            key={item.id}
            item={item}
            trackId={track.id}
            track={track}
            pixelsPerFrame={pixelsPerFrame}
            isSelected={selectedItemId === item.id}
            assets={assets}
            onSelect={() => onSelectItem(item.id)}
            onDelete={() => onDeleteItem(item.id)}
            onUpdate={onUpdateItem}
            onResize={(edge, deltaFrames) => handleItemResize(item.id, edge, deltaFrames)}
          />
        ))}
      </div>
    </div>
  );
};
