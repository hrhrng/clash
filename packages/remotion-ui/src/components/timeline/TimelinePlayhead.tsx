import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { colors, timeline, zIndex, shadows, animations } from './styles';
import { formatTime, frameToPixels } from './utils/timeFormatter';

interface TimelinePlayheadProps {
  currentFrame: number;
  pixelsPerFrame: number;
  fps: number;
  timelineHeight: number;
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
  timelineHeight,
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
  const lineLeft = centerX - timeline.playheadWidth / 2;
  const triangleLeft = centerX - timeline.playheadTriangleSize / 2;

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
          : xFromContainer - timeline.trackLabelWidth - leftOffset;
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
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: zIndex.playhead,
        pointerEvents: 'none',
      }}
    >
      {/* 竖线：始终渲染。通过 label 面板更高的 z-index 进行遮挡 */}
      <div
        style={{
          position: 'absolute',
          left: lineLeft,
          top: 0,
          bottom: 0,
          width: timeline.playheadWidth,
          backgroundColor: colors.accent.primary,
          boxShadow: isDragging ? '0 0 8px rgba(74, 158, 255, 0.6)' : 'none',
          transition: isDragging ? 'none' : 'box-shadow 0.2s ease',
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
        transition={animations.springGentle}
        style={{
          position: 'absolute',
          // 三角以中心轴定位，使尖端与竖线中心对齐
          left: triangleLeft,
          top: -1,
          width: 0,
          height: 0,
          borderLeft: `${timeline.playheadTriangleSize / 2}px solid transparent`,
          borderRight: `${timeline.playheadTriangleSize / 2}px solid transparent`,
          borderTop: `${timeline.playheadTriangleSize}px solid ${colors.accent.primary}`,
          cursor: 'ew-resize',
          pointerEvents: 'auto',
          filter: isDragging ? 'drop-shadow(0 0 4px rgba(74, 158, 255, 0.8))' : 'none',
          // 三角形也始终渲染，由更高 z-index 的 label 遮挡
          display: 'block',
        }}
      >
        {/* Tooltip - 显示当前时间 */}
        {(isHovered || isDragging) && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              left: '50%',
              bottom: timeline.playheadTriangleSize + 4,
              transform: 'translateX(-50%)',
              backgroundColor: colors.bg.elevated,
              color: colors.text.primary,
              fontSize: 11,
              fontFamily: 'monospace',
              padding: '4px 8px',
              borderRadius: 4,
              whiteSpace: 'nowrap',
              boxShadow: shadows.md,
              pointerEvents: 'none',
              zIndex: zIndex.tooltip,
            }}
          >
            {formatTime(currentFrame, fps)}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};
