import React, { useMemo, useState, useEffect } from "react";
import { useEditor } from "@master-clash/remotion-core";
import { InteractiveCanvas } from "./InteractiveCanvas";

// Time formatting utilities
const formatTime = (frame: number, fps: number) => {
  const totalSeconds = frame / fps;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frameNumber = frame % fps;

  return {
    minutes: minutes.toString().padStart(2, "0"),
    seconds: seconds.toString().padStart(2, "0"),
    frames: frameNumber.toString().padStart(2, "0"),
  };
};

export const CanvasPreview: React.FC = () => {
  const { state, dispatch } = useEditor();
  const [isDragging, setIsDragging] = useState(false);

  // Calculate duration from timeline (max end frame of all items)
  const timelineDuration = useMemo(() => {
    let maxEnd = 0;
    for (const track of state.tracks) {
      for (const item of track.items) {
        const end = item.from + item.durationInFrames;
        if (end > maxEnd) maxEnd = end;
      }
    }
    return maxEnd > 0 ? maxEnd : 300; // 300 frames = 10 seconds at 30fps as fallback
  }, [state.tracks]);

  // Format current and total time
  const currentTime = formatTime(state.currentFrame, state.fps);
  const totalTime = formatTime(timelineDuration, state.fps);

  // Progress bar handlers
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newFrame = Math.round(percentage * timelineDuration);
    dispatch({
      type: "SET_CURRENT_FRAME",
      payload: Math.max(0, Math.min(newFrame, timelineDuration)),
    });
  };

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    handleProgressClick(e);
  };

  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      handleProgressClick(e);
    }
  };

  const handleProgressMouseUp = () => {
    setIsDragging(false);
  };

  // Global mouse up listener for progress bar
  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseUp = () => setIsDragging(false);
      document.addEventListener("mouseup", handleGlobalMouseUp);
      return () => document.removeEventListener("mouseup", handleGlobalMouseUp);
    }
  }, [isDragging]);

  return (
    <div style={styles.container}>
      {/* Canvas Area with InteractiveCanvas */}
      <div style={styles.canvasWrapper}>
        <InteractiveCanvas
          key="interactive-canvas"
          tracks={state.tracks}
          selectedItemId={state.selectedItemId}
          currentFrame={state.currentFrame}
          compositionWidth={state.compositionWidth}
          compositionHeight={state.compositionHeight}
          fps={state.fps}
          durationInFrames={timelineDuration}
          onUpdateItem={(trackId, itemId, updates) => {
            dispatch({
              type: "UPDATE_ITEM",
              payload: { trackId, itemId, updates },
            });
          }}
          onSelectItem={(itemId) => {
            dispatch({
              type: "SELECT_ITEM",
              payload: itemId,
            });
          }}
          playing={state.playing}
          onFrameUpdate={(frame) => {
            dispatch({
              type: "SET_CURRENT_FRAME",
              payload: frame,
            });
          }}
          onPlayingChange={(playing) => {
            dispatch({
              type: "SET_PLAYING",
              payload: playing,
            });
          }}
        />
      </div>

      {/* Custom Controls */}
      <div style={styles.controlsWrapper}>
        <div style={styles.controls}>
          {/* Play/Pause Button */}
          <button
            onClick={() =>
              dispatch({ type: "SET_PLAYING", payload: !state.playing })
            }
            style={styles.playButton}
          >
            {state.playing ? (
              // Pause icon
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              // Play icon
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Time Display */}
          <div style={styles.timeDisplay}>
            <span style={styles.currentTime}>
              {currentTime.minutes}:{currentTime.seconds}:{currentTime.frames}
            </span>
            <span style={styles.timeSeparator}>/</span>
            <span style={styles.totalTime}>
              {totalTime.minutes}:{totalTime.seconds}:{totalTime.frames}
            </span>
          </div>

          {/* Progress Bar */}
          <div
            style={styles.progressContainer}
            onMouseDown={handleProgressMouseDown}
            onMouseMove={handleProgressMouseMove}
            onMouseUp={handleProgressMouseUp}
          >
            <div style={styles.progressTrack}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${(state.currentFrame / timelineDuration) * 100}%`,
                }}
              />
              <div
                style={{
                  ...styles.progressThumb,
                  left: `${(state.currentFrame / timelineDuration) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    backgroundColor: "transparent", // Let parent background show through
  },
  canvasWrapper: {
    flex: 1,
    backgroundColor: "#f1f5f9", // slate-100
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  controlsWrapper: {
    padding: "12px 16px",
    backgroundColor: "white",
    borderTop: "1px solid #e2e8f0", // slate-200
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    maxWidth: "100%",
    margin: "0 auto",
  },
  playButton: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    backgroundColor: "#2563eb", // blue-600
    border: "none",
    color: "white",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s ease",
    flexShrink: 0,
  },
  timeDisplay: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "14px",
    fontFamily: "monospace",
    color: "#0f172a", // slate-900
    minWidth: "140px",
    flexShrink: 0,
  },
  currentTime: {
    color: "#0f172a", // slate-900
    fontWeight: 600,
  },
  timeSeparator: {
    color: "#94a3b8", // slate-400
    margin: "0 4px",
  },
  totalTime: {
    color: "#64748b", // slate-500
  },
  progressContainer: {
    flex: 1,
    height: "40px",
    display: "flex",
    alignItems: "center",
    cursor: "pointer",
    padding: "0 8px",
  },
  progressTrack: {
    position: "relative",
    width: "100%",
    height: "4px",
    backgroundColor: "#e2e8f0", // slate-200
    borderRadius: "2px",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#2563eb", // blue-600
    borderRadius: "2px",
    transition: "width 0.1s ease",
  },
  progressThumb: {
    position: "absolute",
    top: "50%",
    width: "16px",
    height: "16px",
    backgroundColor: "#2563eb", // blue-600
    borderRadius: "50%",
    transform: "translate(-50%, -50%)",
    boxShadow: "0 2px 6px rgba(0, 0, 0, 0.1)",
    transition: "left 0.1s ease",
  },
};
