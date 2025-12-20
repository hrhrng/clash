import React from 'react';
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
  onZoomIn,
  onZoomOut,
  onToggleSnap,
  onZoomChange,
  zoomLimits,
}) => {
  const limits = zoomLimits || { min: 0.25, max: 5 };

  return (
    <div className="h-12 bg-white border-b border-slate-200 flex items-center justify-between px-4 shadow-sm sticky top-0 z-10">
      {/* 左侧：标题和时间显示 */}
      <div className="flex items-center gap-4">
        <div className="text-lg font-semibold text-slate-900">
          Timeline
        </div>

        <div className="bg-slate-100 px-3 py-1.5 rounded-md font-mono text-sm text-slate-900 border border-slate-200 tabular-nums">
          {formatTime(currentFrame, fps)}
        </div>
      </div>

      {/* 中间：控制按钮 */}
      <div className="flex items-center gap-5">
        <ZoomControl
          zoom={zoom}
          min={limits.min}
          max={limits.max}
          onZoomChange={onZoomChange}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
        />

        {/* 分隔线 */}
        <div className="w-px h-5 bg-slate-200" />

        <SnapButton
          enabled={snapEnabled}
          onToggle={onToggleSnap}
        />
      </div>
    </div>
  );
};
