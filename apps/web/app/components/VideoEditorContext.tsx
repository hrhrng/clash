'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useRef, useEffect } from 'react';
import { X } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
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
}

type TimelineDsl = Pick<
    EditorState,
    'tracks' | 'compositionWidth' | 'compositionHeight' | 'fps' | 'durationInFrames'
>;

interface VideoEditorContextType {
    isOpen: boolean;
    openEditor: (assets: Asset[], nodeId: string, timelineDsl?: TimelineDsl | null) => void;
    closeEditor: () => void;
}

const VideoEditorContext = createContext<VideoEditorContextType | undefined>(undefined);

export function VideoEditorProvider({ children }: { children: ReactNode }) {
    const loroSync = useOptionalLoroSyncContext();
    const [isOpen, setIsOpen] = useState(false);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [timelineDsl, setTimelineDsl] = useState<TimelineDsl | null>(null);
    const [editorNodeId, setEditorNodeId] = useState<string | null>(null);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const openEditor = useCallback((newAssets: Asset[], nodeId: string, nextTimelineDsl?: TimelineDsl | null) => {
        setAssets(newAssets);
        setEditorNodeId(nodeId);
        setTimelineDsl(nextTimelineDsl ?? null);
        setIsOpen(true);
    }, []);

    const closeEditor = useCallback(() => {
        setIsOpen(false);
        setAssets([]);
        setTimelineDsl(null);
        setEditorNodeId(null);
    }, []);

    // Track previous DSL to avoid unnecessary updates during playback
    const prevDslRef = useRef<TimelineDsl | null>(null);

    const persistTimelineDsl = useCallback((state: EditorState) => {
        if (!editorNodeId) return;

        const nextDsl: TimelineDsl = {
            tracks: state.tracks,
            compositionWidth: state.compositionWidth,
            compositionHeight: state.compositionHeight,
            fps: state.fps,
            durationInFrames: state.durationInFrames,
        };

        // Skip update if only currentFrame/playing changed (not in TimelineDsl)
        // Compare by JSON to detect actual content changes
        const prevJson = prevDslRef.current ? JSON.stringify(prevDslRef.current) : null;
        const nextJson = JSON.stringify(nextDsl);
        if (prevJson === nextJson) {
            return; // No actual DSL change, skip re-render
        }
        prevDslRef.current = nextDsl;

        setTimelineDsl(nextDsl);

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
            if (loroSync?.connected) {
                loroSync.updateNode(editorNodeId, {
                    data: { timelineDsl: nextDsl },
                });
            }
        }, 400);
    }, [editorNodeId, loroSync]);

    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    return (
        <VideoEditorContext.Provider value={{ isOpen, openEditor, closeEditor }}>
            {children}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
                        onClick={closeEditor}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="relative w-[95vw] h-[90vh] bg-white rounded-xl overflow-hidden shadow-2xl border border-slate-200"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={closeEditor}
                                className="absolute top-4 right-4 z-[60] p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 rounded-full transition-colors"
                            >
                                    <X size={20} />
                                </button>

                            <Editor
                                initialAssets={assets}
                                initialState={timelineDsl ?? undefined}
                                onStateChange={persistTimelineDsl}
                            />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
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
