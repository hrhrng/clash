'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { EditorState } from '@master-clash/remotion-core';

const Editor = dynamic(() => import('@master-clash/remotion-ui').then(mod => mod.Editor), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-screen bg-[#1a1a1a] text-white">
            Loading Editor...
        </div>
    )
});

const EDITOR_DATA_KEY = 'clash_editor_data';

type TimelineDsl = Pick<
    EditorState,
    'tracks' | 'compositionWidth' | 'compositionHeight' | 'fps' | 'durationInFrames'
>;

interface EditorData {
    assets: any[];
    nodeId: string;
    timelineDsl: TimelineDsl | null;
    projectId?: string;
    timestamp: number;
}

export default function EditorStandalonePage() {
    const [editorData, setEditorData] = useState<EditorData | null>(null);
    const [isReady, setIsReady] = useState(false);
    const stateRef = useRef<EditorState | null>(null);

    // Load data from sessionStorage on mount
    useEffect(() => {
        const stored = sessionStorage.getItem(EDITOR_DATA_KEY);
        if (stored) {
            try {
                const data = JSON.parse(stored) as EditorData;
                setEditorData(data);
                setIsReady(true);
            } catch (e) {
                console.error('Failed to parse editor data:', e);
            }
        }
    }, []);

    const handleClose = () => {
        // Send state back to opener
        if (window.opener && editorData) {
            const finalDsl = stateRef.current ? {
                tracks: stateRef.current.tracks,
                compositionWidth: stateRef.current.compositionWidth,
                compositionHeight: stateRef.current.compositionHeight,
                fps: stateRef.current.fps,
                durationInFrames: stateRef.current.durationInFrames,
            } : null;

            window.opener.postMessage({
                type: 'EDITOR_CLOSED',
                nodeId: editorData.nodeId,
                timelineDsl: finalDsl,
            }, '*');
        }

        // Close this tab
        window.close();
    };

    // Handle browser back/close
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (window.opener && editorData && stateRef.current) {
                const finalDsl = {
                    tracks: stateRef.current.tracks,
                    compositionWidth: stateRef.current.compositionWidth,
                    compositionHeight: stateRef.current.compositionHeight,
                    fps: stateRef.current.fps,
                    durationInFrames: stateRef.current.durationInFrames,
                };

                window.opener.postMessage({
                    type: 'EDITOR_CLOSED',
                    nodeId: editorData.nodeId,
                    timelineDsl: finalDsl,
                }, '*');
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [editorData]);

    if (!isReady || !editorData) {
        return (
            <div className="flex items-center justify-center h-screen bg-[#1a1a1a] text-white">
                Loading...
            </div>
        );
    }

    return (
        <div className="h-screen w-screen bg-[#1a1a1a]">
            <Editor
                initialAssets={editorData.assets}
                initialState={editorData.timelineDsl ?? undefined}
                stateRef={stateRef}
                onBack={handleClose}
                backLabel="返回"
            />
        </div>
    );
}
