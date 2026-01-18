
import React, { memo, useCallback, useState } from 'react';
import { Handle, Position, NodeProps, useReactFlow, Node } from 'reactflow';
import { FilmSlate, VideoCamera } from '@phosphor-icons/react';
import { useVideoEditor } from '../VideoEditorContext';
import { useOptionalLoroSyncContext } from '../LoroSyncContext';
import { resolveAssetUrl } from '../../../lib/utils/assets';
import { normalizeStatus, isActiveStatus } from '../../../lib/assetStatus';
import { autoInsertNode } from '../../../lib/layout';

const VideoEditorNode = ({ data, id }: NodeProps) => {
    const { openEditor } = useVideoEditor();
    const loroSync = useOptionalLoroSyncContext();
    const reactFlow = useReactFlow();
    const [rendering, setRendering] = useState(false);
    const [previewSrc, setPreviewSrc] = useState<string | null>(null);

    // Extract first frame source from timeline
    React.useEffect(() => {
        let timelineDsl = data.timelineDsl;
        if (loroSync?.doc) {
            const loroNode = loroSync.doc.getMap('nodes').get(id) as any;
            timelineDsl = loroNode?.data?.timelineDsl ?? timelineDsl;
        }

        if (timelineDsl?.tracks) {
            // Find the earliest visual item across all tracks
            let earliestItem: any = null;
            let minFrom = Infinity;

            for (const track of timelineDsl.tracks) {
                for (const item of (track.items || [])) {
                    if (item.src && item.from < minFrom) {
                        minFrom = item.from;
                        earliestItem = item;
                    }
                }
            }

            if (earliestItem) {
                setPreviewSrc(earliestItem.src);
                return;
            }
        }
        setPreviewSrc(null);
    }, [data.timelineDsl, id, loroSync]);

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
            if (loroSync?.doc) {
                const loroNode = loroSync.doc.getMap('nodes').get(id) as any;
                const loroDsl = loroNode?.data?.timelineDsl;
                if (loroDsl) {
                    // Ensure we have a plain JS object, not a Loro proxy
                    try {
                        timelineDsl = JSON.parse(JSON.stringify(loroDsl));
                    } catch (e) {
                        console.error('[VideoEditorNode] Failed to clone Loro DSL:', e);
                        timelineDsl = loroDsl;
                    }
                }
            }

            if (!timelineDsl || !timelineDsl.tracks || timelineDsl.tracks.length === 0) {
                alert('Please open the editor and create some content first!');
                return;
            }

            // Debug: log detailed structure
            console.log('[VideoEditorNode] Raw timelineDsl:', {
                hasTracks: !!timelineDsl.tracks,
                trackCount: timelineDsl.tracks?.length,
                durationInFrames: timelineDsl.durationInFrames,
            });

            if (timelineDsl.tracks) {
                timelineDsl.tracks.forEach((t: any, i: number) => {
                    console.log(`[VideoEditorNode] Track ${i}:`, t.items?.length, 'items');
                    t.items?.forEach((item: any, j: number) => {
                        console.log(`[VideoEditorNode]   Item ${j}: type=${item.type}, from=${item.from}, duration=${item.durationInFrames}, src=${item.src}`);
                    });
                });
            }

            // Calculate video duration from timeline content
            let maxEndFrame = 0;
            for (const track of timelineDsl.tracks) {
                for (const item of (track.items || [])) {
                    const from = typeof item.from === 'number' ? item.from : 0;
                    const duration = typeof item.durationInFrames === 'number' ? item.durationInFrames : 0;
                    const endFrame = from + duration;

                    if (endFrame > maxEndFrame) {
                        maxEndFrame = endFrame;
                    }
                }
            }
            console.log('[VideoEditorNode] Calculated maxEndFrame:', maxEndFrame);

            // Ensure at least some duration
            if (maxEndFrame === 0) maxEndFrame = 150; // Fallback 5s

            const durationInSeconds = maxEndFrame / (timelineDsl.fps || 30);

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

            // Calculate auto-layout position locally to ensure immediate correct placement
            const newVideoNodeId = `video-${Date.now()}`;
            const currentNodes = reactFlow.getNodes();
            const currentEdges = reactFlow.getEdges();

            // Create temporary node for layout calculation
            // We pretend the edge already exists for the calculation
            const tempEdge = {
                id: `temp-edge-${id}-${newVideoNodeId}`,
                source: id,
                target: newVideoNodeId,
                type: 'default'
            };
            const tempEdges = [...currentEdges, tempEdge];

            // Create temporary node object
            const tempNode: Node = {
                id: newVideoNodeId,
                type: 'video',
                position: { x: 0, y: 0 }, // Placeholder
                data: {},
                parentId: data.parentId, // Inherit parent if inside a group? No, outputs usually go outside or same level. Let's assume same level.
            };
            const tempNodes = [...currentNodes, tempNode];

            // Run auto-layout calculation
            const layoutResult = autoInsertNode(newVideoNodeId, tempNodes, tempEdges);
            const finalPosition = layoutResult.position;

            console.log('[VideoEditorNode] Calculated layout position:', finalPosition);

            const newVideoNode = {
                id: newVideoNodeId,
                type: 'video',
                position: finalPosition,
                parentId: data.parentId, // Keep in same group if editor is in a group
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

            // Also add to ReactFlow for immediate UI update (with calculated position)
            console.log('[VideoEditorNode] Adding to ReactFlow:', newVideoNodeId);
            reactFlow.addNodes(newVideoNode);
            reactFlow.addEdges(newEdge);

            // Sync pushed nodes from layout result
            if (layoutResult.pushedNodes.size > 0) {
                console.log('[VideoEditorNode] Syncing pushed nodes:', layoutResult.pushedNodes.size);
                layoutResult.pushedNodes.forEach((pos, nodeId) => {
                    loroSync.updateNode(nodeId, { position: pos });
                    // Also update ReactFlow locally
                    reactFlow.setNodes((nds) =>
                        nds.map((n) => (n.id === nodeId ? { ...n, position: pos } : n))
                    );
                });
            }

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
            className="group relative min-w-[400px] max-w-[600px]"
            onDoubleClick={handleOpenEditor}
        >
            {/* Main Card */}
            <div className="w-full bg-white shadow-md rounded-matrix overflow-hidden transition-all duration-300 hover:shadow-lg ring-1 ring-slate-200">
                {/* Header Badge */}
                <div className="absolute top-3 left-3 z-10">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/90 backdrop-blur-sm rounded-md shadow-sm border border-slate-200/50">
                        <FilmSlate className="w-3.5 h-3.5 text-blue-500" weight="fill" />
                        <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">Timeline Editor</span>
                    </div>
                </div>

                {/* Preview Area */}
                <div className="relative w-full aspect-video bg-stone-100 flex items-center justify-center overflow-hidden border-b border-slate-100">
                    {previewSrc ? (
                        previewSrc.match(/\.(mp4|webm|mov)$/i) ? (
                            <video
                                src={resolveAssetUrl(previewSrc)}
                                className="w-full h-full object-cover pointer-events-none"
                                preload="auto"
                                muted
                                playsInline
                                // Show first frame
                                onLoadedMetadata={(e) => { (e.target as HTMLVideoElement).currentTime = 0; }}
                            />
                        ) : (
                            <img
                                src={resolveAssetUrl(previewSrc)}
                                alt="Preview"
                                className="w-full h-full object-cover pointer-events-none"
                            />
                        )
                    ) : (
                        <div className="flex flex-col items-center justify-center gap-3 p-6">
                            <div className="rounded-full w-16 h-16 flex justify-center items-center bg-white shadow-sm group-hover:bg-blue-50 transition-colors">
                                <FilmSlate className="w-8 h-8 text-stone-500 group-hover:text-blue-500 transition-colors" weight="duotone" />
                            </div>
                            <div className="text-center">
                                <div className="text-sm font-bold text-stone-700">Video Editor</div>
                                <div className="text-xs text-gray-400 mt-1">Double-click to open</div>
                            </div>
                        </div>
                    )}

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center pointer-events-none">
                        {previewSrc && (
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 text-white px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm">
                                Open Editor
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="bg-slate-50 px-3 py-2 border-t border-slate-100 flex items-center justify-end h-10">
                    <button
                        onClick={handleRender}
                        disabled={rendering}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-700 rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95"
                    >
                        <VideoCamera className="w-3.5 h-3.5" weight="fill" />
                        {rendering ? 'Rendering...' : 'Render'}
                    </button>
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
