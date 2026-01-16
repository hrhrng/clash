'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { EditorState } from '@master-clash/remotion-core';
import { useOptionalLoroSyncContext } from './LoroSyncContext';

const Editor = dynamic(() => import('@master-clash/remotion-ui').then(mod => mod.Editor), {
    ssr: false,
    loading: () => <div className="text-white p-4">Loading Editor...</div>
});

interface Asset {
    id: string;
    type: 'video' | 'image' | 'audio';
    src: string;
    name?: string;
    width?: number;
    height?: number;
    duration?: number;
    sourceNodeId?: string;
}

type TimelineDsl = Pick<
    EditorState,
    'tracks' | 'compositionWidth' | 'compositionHeight' | 'fps' | 'durationInFrames'
>;

interface VideoEditorContextType {
    isOpen: boolean;
    openEditor: (
        assets: Asset[],
        nodeId: string,
        timelineDsl?: TimelineDsl | null,
        availableAssets?: Array<Asset & { sourceNodeId?: string }>
    ) => void;
    closeEditor: () => void;
}

const VideoEditorContext = createContext<VideoEditorContextType | undefined>(undefined);

export function VideoEditorProvider({
    children,
    onAssetAddedToCanvas,
    onCanvasAssetLinked,
}: {
    children: ReactNode;
    onAssetAddedToCanvas?: (
        file: File,
        type: 'video' | 'image' | 'audio',
        editorNodeId: string
    ) => Promise<Asset | null> | Asset | null;
    onCanvasAssetLinked?: (asset: Asset & { sourceNodeId?: string }, editorNodeId: string) => void;
}) {
    const loroSync = useOptionalLoroSyncContext();
    const [isOpen, setIsOpen] = useState(false);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [availableAssets, setAvailableAssets] = useState<Array<Asset & { sourceNodeId?: string }>>([]);
    const [timelineDsl, setTimelineDsl] = useState<TimelineDsl | null>(null);
    const [editorNodeId, setEditorNodeId] = useState<string | null>(null);

    // Ref to read editor state on close - no callbacks during playback
    const editorStateRef = useRef<EditorState | null>(null);

    const openEditor = useCallback((
        newAssets: Asset[],
        nodeId: string,
        nextTimelineDsl?: TimelineDsl | null,
        nextAvailableAssets: Array<Asset & { sourceNodeId?: string }> = []
    ) => {
        console.log('[VideoEditorContext] openEditor called with newAssets:', newAssets.length, newAssets);
        // Deduplicate assets before setting
        const seenKeys = new Set<string>();
        const deduplicatedAssets = newAssets.filter(asset => {
            const key = asset.sourceNodeId || asset.id;
            if (seenKeys.has(key)) {
                return false;
            }
            seenKeys.add(key);
            return true;
        });

        setAssets(deduplicatedAssets);
        setEditorNodeId(nodeId);
        setTimelineDsl(nextTimelineDsl ?? null);
        setAvailableAssets(nextAvailableAssets);
        setIsOpen(true);
    }, []);

    const closeEditor = useCallback(() => {
        // Save state on close - read from ref
        if (editorNodeId && editorStateRef.current && loroSync?.connected) {
            const state = editorStateRef.current;
            const finalDsl: TimelineDsl = {
                tracks: state.tracks,
                compositionWidth: state.compositionWidth,
                compositionHeight: state.compositionHeight,
                fps: state.fps,
                durationInFrames: state.durationInFrames,
            };
            loroSync.updateNode(editorNodeId, {
                data: { timelineDsl: finalDsl },
            });
        }

        setIsOpen(false);
        setAssets([]);
        setAvailableAssets([]);
        setTimelineDsl(null);
        setEditorNodeId(null);
        editorStateRef.current = null;
    }, [editorNodeId, loroSync]);

    const handleAssetUpload = useCallback(
        async (file: File, type: 'video' | 'image' | 'audio') => {
            if (!editorNodeId || !onAssetAddedToCanvas) return;
            const result = await onAssetAddedToCanvas(file, type, editorNodeId);
            if (!result) return;
            setAssets((current) => {
                const exists = current.some((asset) =>
                    asset.id === result.id ||
                    asset.src === result.src ||
                    (result.sourceNodeId && asset.sourceNodeId === result.sourceNodeId)
                );
                return exists ? current : [...current, result];
            });
        },
        [editorNodeId, onAssetAddedToCanvas]
    );

    const handleAssetPicked = useCallback(
        (asset: Asset & { sourceNodeId?: string }) => {
            if (!editorNodeId || !onCanvasAssetLinked) return;
            onCanvasAssetLinked(asset, editorNodeId);
        },
        [editorNodeId, onCanvasAssetLinked]
    );

    return (
        <VideoEditorContext.Provider value={{ isOpen, openEditor, closeEditor }}>
            {children}
            {/* Full-screen editor overlay - no animation for performance */}
            {isOpen && (
                <div className="fixed inset-0 z-[100] bg-[#1a1a1a]">
                    <Editor
                        initialAssets={assets}
                        initialState={timelineDsl ?? undefined}
                        stateRef={editorStateRef}
                        onBack={closeEditor}
                        backLabel="返回"
                        onAssetUpload={handleAssetUpload}
                        availableAssets={availableAssets}
                        onAssetPicked={handleAssetPicked}
                        editorKey={editorNodeId ?? undefined}
                    />
                </div>
            )}
        </VideoEditorContext.Provider>
    );
}

export function useVideoEditor() {
    const context = useContext(VideoEditorContext);
    if (!context) {
        throw new Error('useVideoEditor must be used within VideoEditorProvider');
    }
    return context;
}
