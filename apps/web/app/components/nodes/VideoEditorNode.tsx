
import React, { memo, useCallback, useState } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { FilmSlate, Play, ArrowSquareOut, VideoCamera } from '@phosphor-icons/react';
import { useVideoEditor } from '../VideoEditorContext';
import { useOptionalLoroSyncContext } from '../LoroSyncContext';
import { resolveAssetUrl } from '../../../lib/utils/assets';
import { normalizeStatus, isActiveStatus } from '../../../lib/assetStatus';

const VideoEditorNode = ({ data, id }: NodeProps) => {
    const { openEditor } = useVideoEditor();
    const loroSync = useOptionalLoroSyncContext();
    const reactFlow = useReactFlow();
    const [rendering, setRendering] = useState(false);

    const handleOpenEditor = useCallback(() => {
        const assets = data.inputs || [];
        console.log('[VideoEditorNode] handleOpenEditor called with assets:', assets.length, assets);
        let timelineDsl = data.timelineDsl;
        if (loroSync?.doc) {
            const loroNode = loroSync.doc.getMap('nodes').get(id) as any;
            timelineDsl = loroNode?.data?.timelineDsl ?? timelineDsl;
        }
        const nodes = reactFlow.getNodes();
        const edges = reactFlow.getEdges();
        const connectedAssetIds = new Set(
            edges
                .filter((edge) => edge.target === id && edge.targetHandle === 'assets')
                .map((edge) => edge.source)
        );
        const inputSrcs = new Set(
            (assets || []).map((asset: any) => asset?.src).filter(Boolean)
        );
        const seenKeys = new Set<string>();
        const availableAssets = nodes
            .filter((node) => ['image', 'video', 'audio'].includes(node.type || ''))
            .filter((node) => node.data?.src && !connectedAssetIds.has(node.id))
            .filter((node) => {
                const statusValue = node.data?.status;
                if (typeof statusValue !== 'string') return true;
                return !isActiveStatus(normalizeStatus(statusValue));
            })
            .map((node) => ({
                id: node.id,
                type: node.type as 'image' | 'video' | 'audio',
                src: resolveAssetUrl(node.data.src),
                name: node.data?.label || node.type,
                width: node.data?.naturalWidth,
                height: node.data?.naturalHeight,
                duration: node.data?.duration,
                sourceNodeId: node.id,
            }))
            .filter((asset) => {
                if (inputSrcs.has(asset.src)) return false;
                const key = asset.sourceNodeId || asset.src;
                if (seenKeys.has(key)) return false;
                seenKeys.add(key);
                return true;
            });
        openEditor(assets, id, timelineDsl, availableAssets);
    }, [data.inputs, data.timelineDsl, id, loroSync, openEditor, reactFlow]);

    const handleRender = useCallback(async () => {
        console.log('[VideoEditorNode] handleRender called');
        console.log('[VideoEditorNode] loroSync.connected:', loroSync?.connected);

        if (!loroSync?.doc) {
            console.error('[VideoEditorNode] LoroSync not connected');
            return;
        }

        setRendering(true);
        try {
            // Get current timeline DSL from node or data
            let timelineDsl = data.timelineDsl;
            const loroNode = loroSync.doc.getMap('nodes').get(id) as any;
            timelineDsl = loroNode?.data?.timelineDsl ?? timelineDsl;

            if (!timelineDsl || !timelineDsl.tracks || timelineDsl.tracks.length === 0) {
                alert('Please open the editor and create some content first!');
                return;
            }

            // Calculate video duration from timeline content
            let maxEndFrame = 0;
            for (const track of timelineDsl.tracks) {
                for (const item of track.items) {
                    const endFrame = item.from + item.durationInFrames;
                    if (endFrame > maxEndFrame) {
                        maxEndFrame = endFrame;
                    }
                }
            }
            const durationInSeconds = maxEndFrame / timelineDsl.fps;

            // Debug: log duration calculation
            console.log('[VideoEditorNode] Duration calculation:', {
                maxEndFrame,
                fps: timelineDsl.fps,
                calculatedDuration: durationInSeconds,
                originalDuration: timelineDsl.durationInFrames,
                compositionSize: `${timelineDsl.compositionWidth}x${timelineDsl.compositionHeight}`,
            });

            // Create a new video node with the rendered content
            // IMPORTANT: Override durationInFrames to use calculated value
            const updatedTimelineDsl = {
                ...timelineDsl,
                durationInFrames: maxEndFrame,
            };

            console.log('[VideoEditorNode] Creating video node with:', {
                compositionWidth: timelineDsl.compositionWidth,
                compositionHeight: timelineDsl.compositionHeight,
                maxEndFrame,
                durationInSeconds,
            });

            const newVideoNodeId = `video-${Date.now()}`;
            const newVideoNode = {
                id: newVideoNodeId,
                type: 'video',
                position: {
                    x: data.position?.x + 250 || 400,
                    y: data.position?.y || 100,
                },
                data: {
                    label: `Rendered Video`,
                    src: null,  // Will be filled by callback when rendering completes
                    status: 'generating',
                    duration: durationInSeconds,
                    timelineDsl: updatedTimelineDsl,
                    pendingTask: null,
                    // Set natural dimensions to match video editor canvas for correct aspect ratio
                    naturalWidth: timelineDsl.compositionWidth,
                    naturalHeight: timelineDsl.compositionHeight,
                },
            };

            console.log('[VideoEditorNode] New video node data:', {
                naturalWidth: newVideoNode.data.naturalWidth,
                naturalHeight: newVideoNode.data.naturalHeight,
                durationInFrames: updatedTimelineDsl.durationInFrames,
            });

            // Add new node to LoroSync
            console.log('[VideoEditorNode] Adding to LoroSync:', newVideoNodeId);
            loroSync.addNode(newVideoNodeId, newVideoNode);

            // Create edge from editor to new video node
            const edgeId = `${id}-${newVideoNodeId}`;
            const newEdge = {
                id: edgeId,
                source: id,
                target: newVideoNodeId,
                type: 'default',
            };
            console.log('[VideoEditorNode] Adding edge to LoroSync:', edgeId);
            loroSync.addEdge(edgeId, newEdge);

            // Also add to ReactFlow for immediate UI update
            console.log('[VideoEditorNode] Adding to ReactFlow:', newVideoNodeId);
            reactFlow.addNodes(newVideoNode);
            reactFlow.addEdges(newEdge);

            // Debug: Check what ReactFlow actually has
            setTimeout(() => {
                const nodeInFlow = reactFlow.getNode(newVideoNodeId);
                console.log('[VideoEditorNode] Node in ReactFlow:', nodeInFlow);
                console.log('[VideoEditorNode] Node data:', nodeInFlow?.data);
            }, 100);
        } catch (error) {
            console.error('[VideoEditorNode] Failed to trigger render:', error);
        } finally {
            setRendering(false);
        }
    }, [data, id, loroSync, reactFlow]);

    return (
        <div
            className="group relative min-w-[200px] max-w-[400px]"
            onDoubleClick={handleOpenEditor}
        >
            {/* Main Card */}
            <div className="w-full h-full bg-white shadow-md rounded-matrix overflow-hidden transition-all duration-300 hover:shadow-lg ring-1 ring-slate-200">
                <div className="flex flex-col items-center justify-center p-6 gap-3">
                    <div className="rounded-full w-16 h-16 flex justify-center items-center bg-stone-100 group-hover:bg-blue-50 transition-colors">
                        <FilmSlate className="w-8 h-8 text-stone-500 group-hover:text-blue-500 transition-colors" weight="duotone" />
                    </div>
                    <div className="text-center">
                        <div className="text-sm font-bold text-stone-700">Video Editor</div>
                        <div className="text-xs text-gray-400 mt-1">Double-click to open</div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="bg-slate-50 px-3 py-2 border-t border-slate-100 flex items-center justify-between">
                    <button
                        onClick={handleRender}
                        disabled={rendering}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <VideoCamera className="w-3.5 h-3.5" />
                        {rendering ? 'Rendering...' : 'Render'}
                    </button>
                    <ArrowSquareOut className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                </div>
            </div>

            {/* Input Handle */}
            <Handle
                type="target"
                position={Position.Left}
                id="assets"
                className="!h-4 !w-4 !-translate-x-2 !border-4 !border-white !bg-slate-400 transition-all hover:!bg-blue-500 hover:scale-125 shadow-sm"
            />

            {/* Output Handle */}
            <Handle
                type="source"
                position={Position.Right}
                id="output"
                className="!h-4 !w-4 !translate-x-2 !border-4 !border-white !bg-slate-400 transition-all hover:!bg-blue-500 hover:scale-125 shadow-sm"
            />
        </div>
    );
};

export default memo(VideoEditorNode);
