import React from 'react';
import { motion } from 'framer-motion';
import { colors, timeline, typography, borderRadius, shadows } from './styles';
import { formatTime } from './utils/timeFormatter';
import { ZoomControl, SnapButton } from './TimelineControls';

interface TimelineHeaderProps {
  currentFrame: number;
  fps: number;
  zoom: number;
  snapEnabled: boolean;
  autoFitEnabled?: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToFit?: () => void;
  onZoomReset?: () => void;
  onToggleSnap: () => void;
  onToggleAutoFit?: () => void;
  onZoomChange: (zoom: number) => void;
  zoomLimits?: { min: number; max: number };
}

export const TimelineHeader: React.FC<TimelineHeaderProps> = ({
  currentFrame,
  fps,
  zoom,
  snapEnabled,
  autoFitEnabled = false,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
  onZoomReset,
  onToggleSnap,
  onToggleAutoFit,
  onZoomChange,
  zoomLimits,
}) => {
  const limits = zoomLimits || { min: timeline.zoomMin, max: timeline.zoomMax };

  return (
    <div
        style={{
          height: timeline.headerHeight,
          backgroundColor: colors.bg.secondary,
          borderBottom: `1px solid ${colors.border.default}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          boxShadow: shadows.sm,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
      {/* 左侧：标题和时间显示 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text.primary,
          }}
        >
          Timeline
        </div>

        <div
          style={{
            backgroundColor: colors.bg.elevated,
            padding: '6px 12px',
            borderRadius: borderRadius.md,
            fontFamily: typography.fontFamily.mono,
            fontSize: typography.fontSize.sm,
            color: colors.text.primary,
            border: `1px solid ${colors.border.default}`,
          }}
        >
          {formatTime(currentFrame, fps)}
        </div>
      </div>

      {/* 中间：控制按钮 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <ZoomControl
          zoom={zoom}
          min={limits.min}
          max={limits.max}
          onZoomChange={onZoomChange}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
        />

        {/* 分隔线 */}
        <div
          style={{
            width: 1,
            height: 20,
            backgroundColor: colors.border.default,
          }}
        />

        <SnapButton
          enabled={snapEnabled}
          onToggle={onToggleSnap}
        />
      </div>
    </div>
  );
};
