import React from 'react';
import { EditorProvider, useEditor, type EditorState } from '@master-clash/remotion-core';
import { CanvasPreview } from './CanvasPreview';
import { Timeline } from './Timeline';
import { AssetPanel } from './AssetPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { thumbnailCache, generateVideoThumbnail } from '../utils/thumbnailCache';

const AssetInitializer = ({ assets }: { assets: any[] }) => {
  const { dispatch, state } = useEditor();
  const initializedRef = React.useRef(false);
  const addedAssetsRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    console.log('[AssetInitializer] Effect triggered, assets:', assets.length, assets);
    if (!assets || assets.length === 0) return;

    // Prevent double-initialization (React Strict Mode or re-renders)
    if (initializedRef.current) {
      console.log('[AssetInitializer] Already initialized, skipping');
      return;
    }
    initializedRef.current = true;
    console.log('[AssetInitializer] Initializing assets...');

    // Add the fresh assets (deduplication prevents duplicates)
    // Note: Since we use editorKey to force remount, state.assets is always empty on mount
    assets.forEach(asset => {
      const normalizedType = asset.type === 'video' ? 'video' : asset.type === 'image' ? 'image' : 'audio';
      const assetKey = asset.sourceNodeId || asset.id;

      // Check if already added in this session
      if (addedAssetsRef.current.has(assetKey)) {
        return;
      }

      const existingById = state.assets.find((a) => a.id === asset.id);
      const existingBySrc = state.assets.find((a) => a.src === (asset.src || asset.url));
      const existingBySourceNode = state.assets.find((a) =>
        asset.sourceNodeId && a.sourceNodeId === asset.sourceNodeId
      );
      const existingByNameType = state.assets.find(
        (a) => a.name === (asset.name || 'Imported Asset') && a.type === normalizedType
      );

      if (existingById || existingBySrc || existingBySourceNode) {
        return;
      }

      if (existingByNameType && !existingByNameType.readOnly) {
        dispatch({ type: 'REMOVE_ASSET', payload: existingByNameType.id });
      }

      addedAssetsRef.current.add(assetKey);
      const assetId = asset.id || `asset-${Date.now()}-${Math.random()}`;
      const assetSrc = asset.src || asset.url;

      // For video assets, check cache first, then generate thumbnail if needed
      if (normalizedType === 'video' && assetSrc) {
        // Step 1: Check if we already have a cached thumbnail
        const cachedThumbnail = thumbnailCache.get(assetSrc);

        // Step 2: Check if asset already has thumbnail or duration
        const hasThumbnail = asset.thumbnail || cachedThumbnail;
        const hasDuration = asset.duration;

        // If we have everything from cache or asset data, add directly
        if (hasThumbnail && hasDuration) {
          dispatch({
            type: 'ADD_ASSET',
            payload: {
              id: assetId,
              type: normalizedType,
              src: assetSrc,
              name: asset.name || 'Imported Asset',
              width: asset.width,
              height: asset.height,
              duration: asset.duration,
              thumbnail: asset.thumbnail || cachedThumbnail || undefined,
              createdAt: Date.now(),
              readOnly: true,
              sourceNodeId: asset.sourceNodeId,
            }
          });
          return;
        }

        // Step 3: Need to load video metadata or generate thumbnail
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.crossOrigin = 'anonymous';

        video.onloadedmetadata = () => {
          const duration = video.duration || 0;
          const needsThumbnail = !hasThumbnail;

          if (!needsThumbnail && hasDuration) {
            // Already have duration and thumbnail from cache, just update
            return;
          }

          // Generate thumbnail if needed (async)
          if (needsThumbnail) {
            generateVideoThumbnail(assetSrc).then(thumbnail => {
              if (thumbnail) {
                // Cache the generated thumbnail for future use
                thumbnailCache.set(assetSrc, thumbnail);
              }

              // Remove and re-add with duration and thumbnail
              dispatch({ type: 'REMOVE_ASSET', payload: assetId });
              dispatch({
                type: 'ADD_ASSET',
                payload: {
                  id: assetId,
                  type: normalizedType,
                  src: assetSrc,
                  name: asset.name || 'Imported Asset',
                  width: asset.width,
                  height: asset.height,
                  duration: duration,
                  thumbnail: thumbnail || cachedThumbnail || undefined,
                  createdAt: Date.now(),
                  readOnly: true,
                  sourceNodeId: asset.sourceNodeId,
                }
              });
            });
          } else {
            // Just update duration
            dispatch({ type: 'REMOVE_ASSET', payload: assetId });
            dispatch({
              type: 'ADD_ASSET',
              payload: {
                id: assetId,
                type: normalizedType,
                src: assetSrc,
                name: asset.name || 'Imported Asset',
                width: asset.width,
                height: asset.height,
                duration: duration,
                thumbnail: cachedThumbnail || undefined,
                createdAt: Date.now(),
                readOnly: true,
                sourceNodeId: asset.sourceNodeId,
              }
            });
          }
        };

        video.onerror = () => {
          // If video fails to load, still add the asset with cached thumbnail if available
          dispatch({
            type: 'ADD_ASSET',
            payload: {
              id: assetId,
              type: normalizedType,
              src: assetSrc,
              name: asset.name || 'Imported Asset',
              width: asset.width,
              height: asset.height,
              duration: asset.duration,
              thumbnail: cachedThumbnail || undefined,
              createdAt: Date.now(),
              readOnly: true,
              sourceNodeId: asset.sourceNodeId,
            }
          });
        };

        video.src = assetSrc;
      } else {
        // For non-video assets, add directly
        console.log('[AssetInitializer] Dispatching ADD_ASSET for non-video:', normalizedType, assetId);
        dispatch({
          type: 'ADD_ASSET',
          payload: {
            id: assetId,
            type: normalizedType,
            src: assetSrc,
            name: asset.name || 'Imported Asset',
            width: asset.width,
            height: asset.height,
            duration: asset.duration,
            thumbnail: asset.thumbnail,
            createdAt: Date.now(),
            readOnly: true,
            sourceNodeId: asset.sourceNodeId,
          }
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);
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

    // 检查是否需要从头开始播放
    // 如果当前帧已经到达或超过结束帧，重置到第0帧
    const duration = durationRef.current;
    const shouldResetToStart = state.currentFrame >= duration;

    startTimeRef.current = performance.now();
    startFrameRef.current = shouldResetToStart ? 0 : state.currentFrame;

    // 如果需要重置，先设置当前帧为0
    if (shouldResetToStart) {
      dispatch({ type: 'SET_CURRENT_FRAME', payload: 0 });
    }

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
  }, [state.playing, dispatch, state.currentFrame]);

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
  /** Unique key to force remount when opening different editors */
  editorKey?: string;
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
  editorKey,
}) => {
  // DO NOT include assets in initialState - they are managed by AssetInitializer
  const cleanInitialState = { ...initialState, assets: undefined };

  return (
    <EditorProvider initialState={cleanInitialState} onStateChange={onStateChange} key={editorKey}>
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
