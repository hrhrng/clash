import React, { useState, useRef, useEffect } from 'react';


interface ZoomControlProps {
  zoom: number;
  min: number;
  max: number;
  onZoomChange: (zoom: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export const ZoomControl: React.FC<ZoomControlProps> = ({
  zoom,
  min,
  max,
  onZoomChange,
  onZoomIn,
  onZoomOut,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const sliderRef = useRef<HTMLInputElement>(null);
  const [tooltipX, setTooltipX] = useState(0);
  const [tooltipY, setTooltipY] = useState(0);

  const canZoomIn = zoom < max;
  const canZoomOut = zoom > min;

  const updateTooltipPosition = () => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const percentage = (zoom - min) / (max - min);
    const thumbX = rect.left + percentage * rect.width;
    setTooltipX(thumbX);
    setTooltipY(rect.top);
  };

  const handleMouseDown = () => {
    setIsDragging(true);
    setShowTooltip(true);
    updateTooltipPosition();
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setShowTooltip(false);
  };

  const handleMouseMove = () => {
    if (showTooltip || isDragging) {
      updateTooltipPosition();
    }
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('mousemove', updateTooltipPosition);
      return () => {
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('mousemove', updateTooltipPosition);
      };
    }
  }, [isDragging]);

  return (
    <div className="flex items-center gap-3 h-8">
      {/* Zoom Out Button */}
      <button
        onClick={onZoomOut}
        disabled={!canZoomOut}
        className={`w-7 h-7 flex items-center justify-center rounded-md border text-base leading-none transition-all ${canZoomOut
          ? 'border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-blue-500 hover:text-blue-600 cursor-pointer'
          : 'border-slate-100 text-slate-300 cursor-not-allowed'
          }`}
      >
        −
      </button>

      {/* Slider */}
      <div className="relative w-[180px] h-7 flex items-center group">
        <input
          ref={sliderRef}
          type="range"
          min={min}
          max={max}
          step={0.01}
          value={zoom}
          onChange={(e) => onZoomChange(parseFloat(e.target.value))}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseEnter={() => {
            setShowTooltip(true);
            updateTooltipPosition();
          }}
          onMouseLeave={() => !isDragging && setShowTooltip(false)}
          className="w-full h-1 bg-slate-200 rounded-full appearance-none cursor-pointer outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:active:scale-125"
        />
      </div>

      {/* Zoom In Button */}
      <button
        onClick={onZoomIn}
        disabled={!canZoomIn}
        className={`w-7 h-7 flex items-center justify-center rounded-md border text-base leading-none transition-all ${canZoomIn
          ? 'border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-blue-500 hover:text-blue-600 cursor-pointer'
          : 'border-slate-100 text-slate-300 cursor-not-allowed'
          }`}
      >
        +
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div
          className="fixed bg-slate-900 text-white px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap pointer-events-none shadow-xl z-[999999]"
          style={{
            left: tooltipX,
            top: tooltipY - 40,
            transform: 'translateX(-50%)',
          }}
        >
          {zoom.toFixed(2)}×
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-slate-900" />
        </div>
      )}
    </div>
  );
};

interface SnapButtonProps {
  enabled: boolean;
  onToggle: () => void;
}

export const SnapButton: React.FC<SnapButtonProps> = ({ enabled, onToggle }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [tooltipX, setTooltipX] = useState(0);
  const [tooltipY, setTooltipY] = useState(0);

  const updateTooltipPosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setTooltipX(rect.left + rect.width / 2);
    setTooltipY(rect.top);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={onToggle}
        onMouseEnter={() => {
          setShowTooltip(true);
          updateTooltipPosition();
        }}
        onMouseLeave={() => setShowTooltip(false)}
        onMouseMove={(e) => {
          if (showTooltip) {
            const rect = e.currentTarget.getBoundingClientRect();
            setTooltipX(rect.left + rect.width / 2);
            setTooltipY(rect.top);
          }
        }}
        className={`w-7 h-7 flex items-center justify-center rounded-md border transition-all ${enabled
          ? 'bg-blue-50 border-blue-500 text-blue-600'
          : 'bg-transparent border-slate-200 text-slate-400 hover:border-blue-400 hover:text-blue-500'
          }`}
      >
        {/* Bootstrap Icons Magnet - Professional Design */}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a7 7 0 0 0-7 7v3h4V8a3 3 0 0 1 6 0v3h4V8a7 7 0 0 0-7-7m7 11h-4v3h4zM5 12H1v3h4zM0 8a8 8 0 1 1 16 0v8h-6V8a2 2 0 1 0-4 0v8H0z" />
        </svg>
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div
          className="fixed bg-slate-900 text-white px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap pointer-events-none shadow-xl z-[999999]"
          style={{
            left: tooltipX,
            top: tooltipY - 40,
            transform: 'translateX(-50%)',
          }}
        >
          Magnet {enabled ? 'On' : 'Off'}
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-slate-900" />
        </div>
      )}
    </div>
  );
};
