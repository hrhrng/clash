import React from 'react';
import { EditorProvider, useEditor, type EditorState } from '@master-clash/remotion-core';
import { CanvasPreview } from './CanvasPreview';
import { Timeline } from './Timeline';
import { AssetPanel } from './AssetPanel';
import { PropertiesPanel } from './PropertiesPanel';

const AssetInitializer = ({ assets }: { assets: any[] }) => {
  const { dispatch, state } = useEditor();
  React.useEffect(() => {
    if (assets && assets.length > 0) {
      // Clear existing assets first? Maybe not, or maybe yes.
      // For now, just add.
      assets.forEach(asset => {
        const normalizedType = asset.type === 'video' ? 'video' : asset.type === 'image' ? 'image' : 'audio';
        const existingById = state.assets.find((a) => a.id === asset.id);
        const existingBySrc = state.assets.find((a) => a.src === (asset.src || asset.url));
        const existingByNameType = state.assets.find(
          (a) => a.name === (asset.name || 'Imported Asset') && a.type === normalizedType
        );

        if (existingById || existingBySrc) return;

        if (existingByNameType && !existingByNameType.readOnly) {
          dispatch({ type: 'REMOVE_ASSET', payload: existingByNameType.id });
        }

        dispatch({
          type: 'ADD_ASSET',
          payload: {
            id: asset.id || `asset-${Date.now()}-${Math.random()}`,
            type: normalizedType,
            src: asset.src || asset.url,
            name: asset.name || 'Imported Asset',
            width: asset.width,
            height: asset.height,
            createdAt: Date.now(),
            readOnly: true,
          }
        });
      });
    }
  }, [assets, dispatch, state.assets]);
  return null;
};

/**
 * Syncs editor state to an external ref without triggering re-renders.
 * Used for "save on close" pattern - parent reads ref when editor closes.
 */
const StateSyncer = ({ stateRef }: { stateRef: React.MutableRefObject<EditorState | null> }) => {
  const { state } = useEditor();
  // Update ref on every render, no useEffect needed - this is intentional
  stateRef.current = state;
  return null;
};

const PlaybackController = () => {
  const { state, dispatch } = useEditor();
  const rafRef = React.useRef<number | null>(null);
  const startTimeRef = React.useRef<number>(0);
  const startFrameRef = React.useRef<number>(0);
  const fpsRef = React.useRef<number>(state.fps);
  const durationRef = React.useRef<number>(state.durationInFrames);
  const lastFrameRef = React.useRef<number>(state.currentFrame);
  const prevPlayingRef = React.useRef<boolean>(state.playing);

  fpsRef.current = state.fps;
  const contentEndInFrames = React.useMemo(() => {
    let maxEnd = 0;
    for (const track of state.tracks) {
      for (const item of track.items) {
        const end = item.from + item.durationInFrames;
        if (end > maxEnd) maxEnd = end;
      }
    }
    return maxEnd;
  }, [state.tracks]);
  if (!state.playing) {
    durationRef.current = contentEndInFrames > 0 ? contentEndInFrames : state.durationInFrames;
  }

  React.useEffect(() => {
    if (state.playing && !prevPlayingRef.current) {
      durationRef.current = contentEndInFrames > 0 ? contentEndInFrames : state.durationInFrames;
    }
    prevPlayingRef.current = state.playing;
  }, [state.playing, contentEndInFrames, state.durationInFrames]);

  React.useEffect(() => {
    if (!state.playing) return;
    if (state.currentFrame !== lastFrameRef.current) {
      startTimeRef.current = performance.now();
      startFrameRef.current = state.currentFrame;
      lastFrameRef.current = state.currentFrame;
    }
  }, [state.playing, state.currentFrame]);

  React.useEffect(() => {
    if (!state.playing) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    startTimeRef.current = performance.now();
    startFrameRef.current = state.currentFrame;

    const tick = () => {
      const fps = fpsRef.current;
      const duration = durationRef.current;
      if (!fps || duration < 1) {
        dispatch({ type: 'SET_PLAYING', payload: false });
        return;
      }

      const elapsed = performance.now() - startTimeRef.current;
      const elapsedFrames = Math.round((elapsed / 1000) * fps);
      const nextFrame = Math.min(startFrameRef.current + elapsedFrames, duration);

      if (nextFrame !== lastFrameRef.current) {
        lastFrameRef.current = nextFrame;
        dispatch({ type: 'SET_CURRENT_FRAME', payload: nextFrame });
      }

      if (nextFrame >= duration) {
        dispatch({ type: 'SET_PLAYING', payload: false });
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [state.playing, dispatch]);

  return null;
};

type EditorProps = {
  initialAssets?: any[];
  initialState?: Partial<EditorState>;
  /** Ref to read final state on close - avoids onStateChange overhead during playback */
  stateRef?: React.MutableRefObject<EditorState | null>;
  /** @deprecated Use stateRef for better performance */
  onStateChange?: (state: EditorState) => void;
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

export const Editor: React.FC<EditorProps> = ({
  initialAssets,
  initialState,
  stateRef,
  onStateChange,
  onBack,
  backLabel,
  onAssetUpload,
  availableAssets,
  onAssetPicked,
}) => {
  return (
    <EditorProvider initialState={initialState} onStateChange={onStateChange}>
      {stateRef && <StateSyncer stateRef={stateRef} />}
      <PlaybackController />
      <AssetInitializer assets={initialAssets || []} />
      <div className="w-full h-full flex flex-col bg-white font-sans text-slate-900">
        {/* Header removed as requested */}

        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Assets */}
          <aside className="shrink-0 border-r border-slate-200 bg-slate-50/50" style={{ width: '22%', minWidth: 220, maxWidth: 360 }}>
            <AssetPanel
              onBack={onBack}
              backLabel={backLabel}
              onAssetUpload={onAssetUpload}
              availableAssets={availableAssets}
              onAssetPicked={onAssetPicked}
            />
          </aside>

          {/* Main Content Area */}
          <main className="flex-1 flex flex-col min-w-0 bg-slate-50/30">
            {/* Top Row - Preview and Properties */}
            <div className="flex-1 flex" style={{ minHeight: 0 }}>
              {/* Preview Area */}
              <div
                className="flex-1 p-4 flex items-center justify-center bg-slate-100/50"
                style={{ minHeight: 0 }}
              >
                <div className="w-full h-full rounded-lg overflow-hidden bg-white shadow-lg ring-1 ring-slate-900/5">
                  <CanvasPreview />
                </div>
              </div>
              <aside className="w-[320px] shrink-0 border-l border-slate-200 bg-white">
                <PropertiesPanel />
              </aside>
            </div>

            {/* Timeline Area - Full Width with fixed height */}
            <div
              className="border-t border-slate-200 bg-white relative"
              style={{ height: 300, flexShrink: 0 }}
            >
              <Timeline />
            </div>
          </main>
        </div>
      </div>
    </EditorProvider>
  );
};
