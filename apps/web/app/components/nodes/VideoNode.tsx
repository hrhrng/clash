import { memo, useState, useEffect } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { FilmSlate, TextT } from '@phosphor-icons/react';
import { useMediaViewer } from '../MediaViewerContext';
import { normalizeStatus, isActiveStatus, type AssetStatus } from '../../../lib/assetStatus';

import { getAsset } from '../../actions';
import { resolveAssetUrl } from '../../../lib/utils/assets';

const VideoNode = ({ data, selected, id }: NodeProps) => {
    const [label, setLabel] = useState(data.label || 'Video Node');
    const { openViewer } = useMediaViewer();
    const { setNodes } = useReactFlow();
    const [status, setStatus] = useState<AssetStatus>(normalizeStatus(data.status) || (data.src ? 'completed' : 'generating'));
    const [videoUrl, setVideoUrl] = useState(data.src);
    const [description, setDescription] = useState(data.description || '');
    const [showDescription, setShowDescription] = useState(false);

    // Sync status and videoUrl from Loro data changes
    useEffect(() => {
        const newStatus = normalizeStatus(data.status);
        if (newStatus !== status) {
            setStatus(newStatus);
        }
        if (data.src !== videoUrl) {
            setVideoUrl(data.src);
        }
    }, [data.status, data.src]);

    useEffect(() => {
        // Poll if generating OR (completed but missing description)
        const shouldPoll = isActiveStatus(status) || (status === 'completed' && !description);

        if (shouldPoll && data.assetId) {
            const interval = setInterval(async () => {
                try {
                    const asset = await getAsset(data.assetId);
                    if (asset) {
                        // Update status if changed
                        const newAssetStatus = normalizeStatus(asset.status || undefined);
                        if (newAssetStatus !== status) {
                            setStatus(newAssetStatus);
                        }

                        // Update URL if changed
                        if (asset.url !== videoUrl) {
                            setVideoUrl(asset.url);
                        }

                        // Update description if available
                        if (asset.description && asset.description !== description) {
                            setDescription(asset.description);
                        }

                        // Update node data
                        setNodes((nds) =>
                            nds.map((node) => {
                                if (node.id === id) {
                                    return {
                                        ...node,
                                        data: {
                                            ...node.data,
                                            src: asset.url,
                                            status: asset.status,
                                            description: asset.description,
                                        },
                                    };
                                }
                                return node;
                            })
                        );

                        // Stop polling if completed and description exists (or failed)
                        if (asset.status === 'failed' || (asset.status === 'completed' && asset.description)) {
                            clearInterval(interval);
                        }
                    }
                } catch (e) {
                    console.error("Polling error:", e);
                }
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [status, description, data.assetId, id, setNodes, videoUrl]);

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (videoUrl && status === 'completed') {
            openViewer('video', resolveAssetUrl(videoUrl), label);
        }
    };

    return (
        <div
            className="group relative min-w-[240px] max-w-[400px]"
        >
            {/* Floating Title Input */}
            <div
                className="absolute -top-8 left-4 z-10"
                onDoubleClick={(e) => e.stopPropagation()}
            >
                <input
                    className="bg-transparent text-lg font-bold text-slate-500 focus:text-slate-900 focus:outline-none"
                    value={label}
                    onChange={(evt) => {
                        const newLabel = evt.target.value;
                        setLabel(newLabel);
                        setNodes((nds) =>
                            nds.map((node) => {
                                if (node.id === id) {
                                    return {
                                        ...node,
                                        data: {
                                            ...node.data,
                                            label: newLabel,
                                        },
                                    };
                                }
                                return node;
                            })
                        );
                    }}
                />
            </div>

            {/* Main Card */}
            <div
                className={`w-full h-full bg-white shadow-md rounded-matrix overflow-hidden transition-all duration-300 hover:shadow-lg ${selected ? 'ring-4 ring-red-500 ring-offset-2' : 'ring-1 ring-slate-200'
                    }`}
                onDoubleClick={handleDoubleClick}
            >
                {status === 'completed' && videoUrl ? (
                    <div className="relative">
                        <video
                            src={resolveAssetUrl(videoUrl)}
                            controls={false} // Disable default controls in node view to prevent conflict
                            className="w-full h-auto max-h-[300px] object-cover pointer-events-none" // Disable pointer events on video to allow double click on container
                        />

                        {/* Top Right Controls */}
                        <div className="absolute top-2 right-2 flex gap-1 z-10">
                            <button
                                className="rounded-full bg-black/50 p-1 text-white backdrop-blur-sm hover:bg-black/70 transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowDescription(!showDescription);
                                }}
                            >
                                <TextT size={12} weight="bold" />
                            </button>
                            <div className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
                                Video
                            </div>
                        </div>

                        {/* Play overlay hint */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 bg-black/10 pointer-events-none">
                            <div className="rounded-full bg-white/20 p-2 backdrop-blur-sm">
                                <FilmSlate size={24} className="text-white" weight="fill" />
                            </div>
                        </div>
                    </div>
                ) : status === 'uploading' && videoUrl ? (
                    <div className="relative">
                        <video
                            src={resolveAssetUrl(videoUrl)}
                            controls={false}
                            className="w-full h-auto max-h-[300px] object-cover pointer-events-none opacity-70"
                        />
                        {/* Loading Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
                            <div className="flex flex-col items-center gap-2">
                                <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white" />
                                <span className="text-xs font-medium text-white animate-pulse">Uploading...</span>
                            </div>
                        </div>
                    </div>
                ) : isActiveStatus(status) ? (
                    <div className="flex h-32 items-center justify-center bg-slate-50 text-slate-400">
                        <div className="flex flex-col items-center gap-3">
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
                            <span className="text-xs font-medium animate-pulse">Generating Video...</span>
                        </div>
                    </div>
                ) : status === 'failed' ? (
                    <div className="flex h-32 items-center justify-center bg-red-50 text-red-400">
                        <div className="flex flex-col items-center gap-2">
                            <FilmSlate size={32} weight="duotone" />
                            <span className="text-xs font-medium">Generation Failed</span>
                        </div>
                    </div>
                ) : (
                    <div className="flex h-32 items-center justify-center bg-slate-100 text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                            <FilmSlate size={32} />
                            <span className="text-xs">No Video</span>
                        </div>
                    </div>
                )}

                {/* Description Box */}
                {showDescription && (
                    <div className="p-3 bg-slate-50 border-t border-slate-100" onDoubleClick={(e) => e.stopPropagation()}>
                        <textarea
                            className="w-full h-24 text-xs text-slate-600 bg-transparent resize-none focus:outline-none"
                            value={description || (status === 'completed' ? 'Generating description...' : 'No description available.')}
                            readOnly
                        />
                    </div>
                )}
            </div>

            {/* Asset nodes only have output (source) */}
            <Handle
                type="target"
                position={Position.Left}
                isConnectable={false}
                className="!h-4 !w-4 !-translate-x-2 !border-4 !border-white !bg-slate-400 transition-all hover:!bg-red-500 hover:scale-125 shadow-sm !opacity-0 !pointer-events-none"
            />
            <Handle
                type="source"
                position={Position.Right}
                className="!h-4 !w-4 !translate-x-2 !border-4 !border-white !bg-slate-400 transition-all hover:!bg-red-500 hover:scale-125 shadow-sm"
            />
        </div>
    );
};

export default memo(VideoNode);
