import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { formatTime, frameToPixels } from './utils/timeFormatter';

interface TimelinePlayheadProps {
  currentFrame: number;
  pixelsPerFrame: number;
  fps: number;
  onSeek: (frame: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  // Horizontal scroll sync from tracks viewport
  scrollLeft?: number;
  // Additional left offset in pixels to account for when the
  // playhead is rendered relative to a container that does not start at
  // the very left edge of the overall timeline (e.g., when placing the
  // playhead only inside the right pane). Default 0.
  leftOffset?: number;
}

export const TimelinePlayhead: React.FC<TimelinePlayheadProps> = ({
  currentFrame,
  pixelsPerFrame,
  fps,
  onSeek,
  onDragStart,
  onDragEnd,
  scrollLeft = 0,
  leftOffset = 0,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const position = frameToPixels(currentFrame, pixelsPerFrame);
  // 播放头中心轴（不再加半线宽，线和手柄都围绕它对齐）
  const centerX = leftOffset + position - scrollLeft;
  // Hardcoded dimensions to match previous style constants
  const playheadWidth = 2;
  const playheadTriangleSize = 16;
  const trackLabelWidth = 200; // Matches TimelineTrack.tsx

  const lineLeft = centerX - playheadWidth / 2;
  const triangleLeft = centerX - playheadTriangleSize / 2;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      setIsDragging(true);
      onDragStart?.();

      const handleMouseMove = (moveEvent: MouseEvent) => {
        // Prefer anchoring to the right content pane to include left inset
        const rightPane = document.querySelector('[data-playhead-container]') as HTMLElement | null;
        const timelineContainer = rightPane || (document.querySelector('[data-timeline-container]') as HTMLElement | null);
        if (!timelineContainer) return;

        const rect = timelineContainer.getBoundingClientRect();
        const xFromContainer = moveEvent.clientX - rect.left;
        const xRelativeToContent = rightPane
          ? xFromContainer - leftOffset
          : xFromContainer - trackLabelWidth - leftOffset;
        const x = xRelativeToContent + scrollLeft;
        const frame = Math.max(0, Math.round(x / pixelsPerFrame));
        onSeek(frame);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        onDragEnd?.();
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [pixelsPerFrame, onSeek, onDragStart, onDragEnd, leftOffset]
  );

  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      {/* 竖线：始终渲染。通过 label 面板更高的 z-index 进行遮挡 */}
      <div
        className={`absolute top-0 bottom-0 w-[2px] bg-blue-500 transition-shadow duration-200 ${isDragging ? 'shadow-[0_0_8px_rgba(59,130,246,0.6)]' : ''
          }`}
        style={{
          left: lineLeft,
        }}
      />

      {/* 顶部三角形拖拽手柄 */}
      <motion.div
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        animate={{
          scale: isDragging ? 1.3 : isHovered ? 1.2 : 1,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className={`absolute top-[-1px] w-0 h-0 border-l-[8px] border-r-[8px] border-t-[16px] border-l-transparent border-r-transparent border-t-blue-500 cursor-ew-resize pointer-events-auto block ${isDragging ? 'drop-shadow-[0_0_4px_rgba(59,130,246,0.8)]' : ''
          }`}
        style={{
          left: triangleLeft,
        }}
      >
        {/* Tooltip - 显示当前时间 */}
        {(isHovered || isDragging) && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="absolute left-1/2 bottom-[20px] -translate-x-1/2 bg-slate-800 text-white text-[11px] font-mono px-2 py-1 rounded shadow-md pointer-events-none whitespace-nowrap z-50"
          >
            {formatTime(currentFrame, fps)}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};
