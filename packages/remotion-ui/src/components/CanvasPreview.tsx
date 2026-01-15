import React, { useMemo } from "react";
import { useEditor } from "@master-clash/remotion-core";
import { InteractiveCanvas } from "./InteractiveCanvas";

export const CanvasPreview: React.FC = React.memo(() => {
  const { state, dispatch } = useEditor();

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
          onRequestPause={() => {
            if (state.playing) {
              dispatch({
                type: "SET_PLAYING",
                payload: false,
              });
            }
          }}
        />
      </div>
    </div>
  );
});

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    backgroundColor: "#1a1a1a",
  },
  canvasWrapper: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    minWidth: 0,
    minHeight: 0,
  },
};
