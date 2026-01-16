import { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position, NodeProps, useReactFlow, useNodes } from 'reactflow';
import { FilmSlate, TextT } from '@phosphor-icons/react';
import { useMediaViewer } from '../MediaViewerContext';
import { useOptionalLoroSyncContext } from '../LoroSyncContext';
import { normalizeStatus, isActiveStatus, type AssetStatus } from '../../../lib/assetStatus';

import { resolveAssetUrl } from '../../../lib/utils/assets';
import { thumbnailCache } from '../../../lib/utils/thumbnailCache';

// Maximum dimension for videos to keep canvas manageable
const MAX_MEDIA_DIMENSION = 500;

/**
 * Calculate scaled dimensions from natural width/height to fit within MAX_MEDIA_DIMENSION
 */
function calculateScaledDimensions(naturalWidth: number, naturalHeight: number): { width: number; height: number } {
    if (!naturalWidth || !naturalHeight) {
        return { width: 400, height: 400 };
    }

    const scale = Math.min(1, MAX_MEDIA_DIMENSION / Math.max(naturalWidth, naturalHeight));
    return {
        width: Math.round(naturalWidth * scale),
        height: Math.round(naturalHeight * scale),
    };
}

/**
 * Parse aspect ratio string (e.g., "16:9", "1:1") and calculate dimensions
 * Returns width and height that fit within MAX_MEDIA_DIMENSION
 */
function calculateDimensionsFromAspectRatio(aspectRatio?: string): { width: number; height: number } {
    if (!aspectRatio) {
        return { width: 400, height: 400 }; // Default square
    }

    const parts = aspectRatio.split(':');
    if (parts.length !== 2) {
        return { width: 400, height: 400 };
    }

    const widthRatio = parseFloat(parts[0]);
    const heightRatio = parseFloat(parts[1]);

    if (!widthRatio || !heightRatio) {
        return { width: 400, height: 400 };
    }

    // Calculate dimensions that fit within MAX_MEDIA_DIMENSION
    if (widthRatio >= heightRatio) {
        // Landscape or square
        const width = MAX_MEDIA_DIMENSION;
        const height = Math.round((heightRatio / widthRatio) * MAX_MEDIA_DIMENSION);
        return { width, height };
    } else {
        // Portrait
        const height = MAX_MEDIA_DIMENSION;
        const width = Math.round((widthRatio / heightRatio) * MAX_MEDIA_DIMENSION);
        return { width, height };
    }
}

const VideoNode = ({ data, selected, id }: NodeProps) => {
    const [label, setLabel] = useState(data.label || 'Video Node');
    const { openViewer } = useMediaViewer();
    const { setNodes } = useReactFlow();
    const nodes = useNodes();
    const loroSync = useOptionalLoroSyncContext();
    const [status, setStatus] = useState<AssetStatus>(normalizeStatus(data.status) || (data.src ? 'completed' : 'generating'));
    const [videoUrl, setVideoUrl] = useState<string | undefined>(data.src);
    const [description, setDescription] = useState(data.description || '');
    const [localThumbnail, setLocalThumbnail] = useState<string | null>(thumbnailCache.get(videoUrl));
    const posterUrl = data.referenceImageUrls?.[0] ? resolveAssetUrl(data.referenceImageUrls[0]) : undefined;
    const lastSizeRef = useRef<{ width: number; height: number } | null>(null);

    // Get current node dimensions
    const currentNode = nodes.find((n) => n.id === id);

    // Calculate dimensions from aspect ratio if available (for generating state)
    const aspectRatioDimensions = calculateDimensionsFromAspectRatio(data.aspectRatio);

    // If natural dimensions are provided (from upload), use those for initial sizing
    const naturalDimensions = data.naturalWidth && data.naturalHeight
        ? calculateScaledDimensions(data.naturalWidth, data.naturalHeight)
        : null;

    // Priority: measured dimensions > natural dimensions > aspect ratio dimensions > default
    // For generating, always use aspect ratio dimensions
    // For uploading with natural dimensions, use those immediately
    const hasPreview = Boolean(videoUrl);
    const useAspectRatioOnly = status === 'generating' || (status === 'uploading' && !hasPreview && !naturalDimensions) || (!hasPreview && !naturalDimensions);
    const measuredWidth = currentNode?.width ?? currentNode?.style?.width;
    const measuredHeight = currentNode?.height ?? currentNode?.style?.height;

    let nodeWidth: number;
    let nodeHeight: number;

    if (useAspectRatioOnly) {
        nodeWidth = aspectRatioDimensions.width;
        nodeHeight = aspectRatioDimensions.height;
    } else if (naturalDimensions && status === 'uploading') {
        nodeWidth = naturalDimensions.width;
        nodeHeight = naturalDimensions.height;
    } else {
        nodeWidth = (measuredWidth as number) ?? naturalDimensions?.width ?? aspectRatioDimensions.width;
        nodeHeight = (measuredHeight as number) ?? naturalDimensions?.height ?? aspectRatioDimensions.height;
    }

    // Load from cache if src changes
    useEffect(() => {
        if (videoUrl) {
            const cached = thumbnailCache.get(videoUrl);
            if (cached) setLocalThumbnail(cached);
        }
    }, [videoUrl]);
    const [showDescription, setShowDescription] = useState(false);

    // Sync status and videoUrl from Loro data changes
    useEffect(() => {
        setStatus((prev: AssetStatus) => {
            const next = normalizeStatus(data.status);
            return next !== prev ? next : prev;
        });
        setVideoUrl((prev: string | undefined) => (data.src !== prev ? data.src : prev));
        setDescription((prev: string) => ((data.description || '') !== prev ? (data.description || '') : prev));
    }, [data.status, data.src, data.description]);

    // Loro sync handles state updates - no polling needed

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (videoUrl && (status === 'completed' || status === 'fin')) {
            openViewer('video', resolveAssetUrl(videoUrl), label);
        }
    };

    return (
        <div
            className="group relative"
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
                className={`relative bg-white shadow-md rounded-matrix overflow-hidden transition-all duration-300 hover:shadow-lg ${selected ? 'ring-4 ring-red-500 ring-offset-2' : 'ring-1 ring-slate-200'
                    }`}
                style={{
                    width: nodeWidth,
                    height: nodeHeight,
                    minWidth: 240,
                    minHeight: 180,
                }}
                onDoubleClick={handleDoubleClick}
            >
                {(status === 'completed' || status === 'fin') && videoUrl ? (
                    <div className="relative">
                        <video
                            src={resolveAssetUrl(videoUrl)}
                            poster={posterUrl}
                            controls={false}
                            className="block pointer-events-none"
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                            }}
                            crossOrigin="anonymous"
                            onLoadedMetadata={(e) => {
                                const video = e.target as HTMLVideoElement;
                                const naturalWidth = video.videoWidth || 0;
                                const naturalHeight = video.videoHeight || 0;
                                const duration = video.duration || 0;

                                // Always update duration in data (even if dimensions haven't changed)
                                if (duration > 0 && data.duration !== duration) {
                                    setNodes((nds) =>
                                        nds.map((node) => {
                                            if (node.id !== id) return node;
                                            return {
                                                ...node,
                                                data: {
                                                    ...node.data,
                                                    duration: duration,
                                                },
                                            };
                                        })
                                    );

                                    if (loroSync?.connected) {
                                        loroSync.updateNode(id, { duration });
                                    }
                                }

                                if (naturalWidth && naturalHeight) {
                                    // Calculate dimensions maintaining the aspect ratio
                                    const scale = Math.min(1, MAX_MEDIA_DIMENSION / Math.max(naturalWidth, naturalHeight));
                                    const nextWidth = Math.round(naturalWidth * scale);
                                    const nextHeight = Math.round(naturalHeight * scale);

                                    // Check if size has changed to avoid unnecessary updates
                                    const prev = lastSizeRef.current;
                                    if (prev && prev.width === nextWidth && prev.height === nextHeight) {
                                        // Trigger thumbnail generation if needed
                                        if (!localThumbnail) {
                                            video.currentTime = 1.0;
                                        }
                                        return;
                                    }
                                    lastSizeRef.current = { width: nextWidth, height: nextHeight };

                                    // Only update if the calculated dimensions differ from current dimensions
                                    // This prevents unnecessary flickering when the aspect ratio already matches
                                    const currentWidth = currentNode?.width ?? currentNode?.style?.width;
                                    const currentHeight = currentNode?.height ?? currentNode?.style?.height;

                                    // Allow 2px tolerance to avoid tiny adjustments
                                    if (Math.abs(currentWidth - nextWidth) < 2 && Math.abs(currentHeight - nextHeight) < 2) {
                                        // Trigger thumbnail generation if needed
                                        if (!localThumbnail) {
                                            video.currentTime = 1.0;
                                        }
                                        return;
                                    }

                                    setNodes((nds) =>
                                        nds.map((node) => {
                                            if (node.id !== id) return node;
                                            return {
                                                ...node,
                                                width: nextWidth,
                                                height: nextHeight,
                                                style: {
                                                    ...node.style,
                                                    width: nextWidth,
                                                    height: nextHeight,
                                                },
                                            };
                                        })
                                    );

                                    if (loroSync?.connected) {
                                        loroSync.updateNode(id, { width: nextWidth, height: nextHeight });
                                    }
                                }

                                // Trigger thumbnail generation if needed
                                if (!localThumbnail) {
                                    video.currentTime = 1.0;
                                }
                            }}
                            onSeeked={(e) => {
                                const video = e.target as HTMLVideoElement;
                                if (video.videoWidth > 0) {
                                    try {
                                        const canvas = document.createElement('canvas');
                                        const size = 160;
                                        const ratio = video.videoWidth / video.videoHeight;
                                        canvas.width = size;
                                        canvas.height = size / ratio;
                                        const ctx = canvas.getContext('2d');
                                        if (ctx) {
                                            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                                            
                                            // Quick pixel check for "blackness"
                                            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                                            const data = imageData.data;
                                            let totalBrightness = 0;
                                            for (let i = 0; i < data.length; i += 40) {
                                                totalBrightness += (data[i] + data[i+1] + data[i+2]) / 3;
                                            }
                                            const avgBrightness = totalBrightness / (data.length / 40);
                                            
                                            if (avgBrightness < 15 && video.currentTime < 5 && video.currentTime < video.duration) {
                                                video.currentTime += 1.0;
                                                return;
                                            }

                                            const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
                                            if (!localThumbnail || avgBrightness > 20) {
                                                thumbnailCache.set(videoUrl, thumbnail);
                                                setLocalThumbnail(thumbnail);
                                            }
                                        }
                                    } catch (err) {
                                        console.warn('[VideoNode] Thumbnail capture failed:', err);
                                    }
                                }
                            }}
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
                            <button
                                className="rounded-full bg-black/50 p-1 text-white backdrop-blur-sm hover:bg-black/70 transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setLocalThumbnail(null);
                                    // The video element is already rendered, we need to trigger a seek to re-capture
                                    const video = document.querySelector(`video[src*="${videoUrl}"]`) as HTMLVideoElement;
                                    if (video) video.currentTime = Math.random() * Math.min(video.duration, 5);
                                }}
                                title="Refresh Thumbnail"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
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
                    <div className="relative" style={{ width: '100%', height: '100%' }}>
                        <video
                            src={resolveAssetUrl(videoUrl)}
                            controls={false}
                            className="block pointer-events-none opacity-70"
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                            }}
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
                    <div className="relative flex items-center justify-center bg-slate-50 text-slate-400" style={{ width: '100%', height: '100%' }}>
                        {posterUrl && (
                            <img src={posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
                        )}
                        <div className="relative z-10 flex flex-col items-center gap-3">
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
                            <span className="text-xs font-medium animate-pulse text-slate-600 bg-white/50 px-2 py-0.5 rounded-full backdrop-blur-sm">Generating Video...</span>
                        </div>
                    </div>
                ) : status === 'failed' ? (
                    <div className="flex items-center justify-center bg-red-50 text-red-400" style={{ width: '100%', height: '100%' }}>
                        <div className="flex flex-col items-center gap-2">
                            <FilmSlate size={32} weight="duotone" />
                            <span className="text-xs font-medium">Generation Failed</span>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-center bg-slate-100 text-slate-400" style={{ width: '100%', height: '100%' }}>
                        <div className="flex flex-col items-center gap-2">
                            <FilmSlate size={32} />
                            <span className="text-xs">No Video</span>
                        </div>
                    </div>
                )}

                {/* Description Box */}
                {showDescription && (
                    <div
                        className="absolute left-0 right-0 bottom-0 z-20 border-t border-slate-100 bg-slate-50/95 p-3 backdrop-blur"
                        onDoubleClick={(e) => e.stopPropagation()}
                    >
                        <textarea
                            className="w-full h-24 resize-none bg-transparent text-xs text-slate-600 focus:outline-none"
                            value={description || ((status === 'completed' || status === 'fin') ? 'Generating description...' : 'No description available.')}
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
                style={{ top: '50%', left: '-8px' }}
                className="!h-4 !w-4 !border-4 !border-white !bg-slate-400 transition-all hover:!bg-red-500 hover:scale-125 shadow-sm !opacity-0 !pointer-events-none"
            />
            <Handle
                type="source"
                position={Position.Right}
                style={{ top: '50%', right: '-8px' }}
                className="!h-4 !w-4 !border-4 !border-white !bg-slate-400 transition-all hover:!bg-red-500 hover:scale-125 shadow-sm"
            />
        </div>
    );
};

export default memo(VideoNode);
