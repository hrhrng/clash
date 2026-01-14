import { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position, NodeProps, useReactFlow, useNodes } from 'reactflow';
import { Image as ImageIcon, TextT } from '@phosphor-icons/react';
import { useMediaViewer } from '../MediaViewerContext';
import { useOptionalLoroSyncContext } from '../LoroSyncContext';
import { normalizeStatus, isActiveStatus, type AssetStatus } from '../../../lib/assetStatus';

import { resolveAssetUrl } from '../../../lib/utils/assets';

// Maximum dimension for images to keep canvas manageable
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

const ImageNode = ({ data, selected, id }: NodeProps) => {
    const [label, setLabel] = useState(data.label || 'Image Node');
    const { openViewer } = useMediaViewer();
    const { setNodes } = useReactFlow();
    const nodes = useNodes();
    const loroSync = useOptionalLoroSyncContext();
    const [status, setStatus] = useState<AssetStatus>(normalizeStatus(data.status) || (data.src ? 'completed' : 'generating'));
    const [imageUrl, setImageUrl] = useState<string | undefined>(data.src);
    const [description, setDescription] = useState(data.description || '');
    const [showDescription, setShowDescription] = useState(false);
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
    const hasPreview = Boolean(imageUrl);
    const useAspectRatioOnly = status === 'generating' || (status === 'uploading' && !hasPreview && !naturalDimensions) || (!hasPreview && !naturalDimensions);
    const measuredWidth = currentNode?.width ?? currentNode?.style?.width;
    const measuredHeight = currentNode?.height ?? currentNode?.style?.height;

    // Determine node dimensions based on priority
    let nodeWidth: number;
    let nodeHeight: number;

    if (useAspectRatioOnly) {
        nodeWidth = aspectRatioDimensions.width;
        nodeHeight = aspectRatioDimensions.height;
    } else if (naturalDimensions && status === 'uploading') {
        // Use pre-calculated natural dimensions during upload
        nodeWidth = naturalDimensions.width;
        nodeHeight = naturalDimensions.height;
    } else {
        nodeWidth = (measuredWidth as number) ?? naturalDimensions?.width ?? aspectRatioDimensions.width;
        nodeHeight = (measuredHeight as number) ?? naturalDimensions?.height ?? aspectRatioDimensions.height;
    }

    // Sync state with props when they change (e.g. from Loro sync)
    useEffect(() => {
        setImageUrl((prev: string | undefined) => (data.src && data.src !== prev ? data.src : prev));
        setStatus((prev: AssetStatus) => {
            const next = normalizeStatus(data.status);
            return next !== prev ? next : prev;
        });
        setDescription((prev: string) => (data.description && data.description !== prev ? data.description : prev));
    }, [data.src, data.status, data.description]);

    // Loro sync handles state updates - no polling needed

    const updateNodeSizeFromImage = (naturalWidth: number, naturalHeight: number) => {
        if (!naturalWidth || !naturalHeight) return;

        // Calculate dimensions maintaining the aspect ratio
        const scale = Math.min(1, MAX_MEDIA_DIMENSION / Math.max(naturalWidth, naturalHeight));
        const nextWidth = Math.round(naturalWidth * scale);
        const nextHeight = Math.round(naturalHeight * scale);

        // Check if size has changed to avoid unnecessary updates
        const prev = lastSizeRef.current;
        if (prev && prev.width === nextWidth && prev.height === nextHeight) return;
        lastSizeRef.current = { width: nextWidth, height: nextHeight };

        const currentWidth = currentNode?.width ?? currentNode?.style?.width;
        const currentHeight = currentNode?.height ?? currentNode?.style?.height;
        const currentWidthValue = typeof currentWidth === 'number' ? currentWidth : Number(currentWidth);
        const currentHeightValue = typeof currentHeight === 'number' ? currentHeight : Number(currentHeight);

        if (Number.isFinite(currentWidthValue) && Number.isFinite(currentHeightValue)) {
            // Allow 2px tolerance to avoid tiny adjustments
            if (Math.abs(currentWidthValue - nextWidth) < 2 && Math.abs(currentHeightValue - nextHeight) < 2) {
                return;
            }
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
            loroSync.updateNode(id, {
                width: nextWidth,
                height: nextHeight,
            });
        }
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (imageUrl && (status === 'completed' || status === 'fin')) {
            openViewer('image', resolveAssetUrl(imageUrl), label);
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
                className={`relative bg-white shadow-md rounded-matrix overflow-hidden transition-all duration-300 hover:shadow-lg ${selected ? 'ring-4 ring-blue-500 ring-offset-2' : 'ring-1 ring-slate-200'
                    }`}
                style={{
                    width: nodeWidth,
                    height: nodeHeight,
                    minWidth: 240,
                    minHeight: 180,
                }}
                onDoubleClick={handleDoubleClick}
            >
                {(status === 'completed' || status === 'fin') && imageUrl ? (
                    <div className="relative">
                        <img
                            src={resolveAssetUrl(imageUrl)}
                            alt={label}
                            className="block"
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                            }}
                            onLoad={(e) => {
                                const img = e.currentTarget;
                                updateNodeSizeFromImage(img.naturalWidth || 0, img.naturalHeight || 0);
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
                        </div>
                    </div>
                ) : status === 'uploading' && imageUrl ? (
                    <div className="relative" style={{ width: '100%', height: '100%' }}>
                        <img
                            src={resolveAssetUrl(imageUrl)}
                            alt={label}
                            className="block opacity-70"
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                            }}
                            onLoad={(e) => {
                                const img = e.currentTarget;
                                updateNodeSizeFromImage(img.naturalWidth || 0, img.naturalHeight || 0);
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
                    <div className="flex items-center justify-center bg-slate-50 text-slate-400" style={{ width: '100%', height: '100%' }}>
                        <div className="flex flex-col items-center gap-3">
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
                            <span className="text-xs font-medium animate-pulse">Generating Image...</span>
                        </div>
                    </div>
                ) : status === 'failed' ? (
                    <div className="flex items-center justify-center bg-red-50 text-red-400" style={{ width: '100%', height: '100%' }}>
                        <div className="flex flex-col items-center gap-2">
                            <ImageIcon size={32} weight="duotone" />
                            <span className="text-xs font-medium">Generation Failed</span>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-center bg-slate-100 text-slate-400" style={{ width: '100%', height: '100%' }}>
                        <div className="flex flex-col items-center gap-2">
                            <ImageIcon size={32} />
                            <span className="text-xs">No Image</span>
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
                className="!h-4 !w-4 !border-4 !border-white !bg-slate-400 transition-all hover:!bg-blue-500 hover:scale-125 shadow-sm !opacity-0 !pointer-events-none"
            />
            <Handle
                type="source"
                position={Position.Right}
                style={{ top: '50%', right: '-8px' }}
                className="!h-4 !w-4 !border-4 !border-white !bg-slate-400 transition-all hover:!bg-blue-500 hover:scale-125 shadow-sm"
            />
        </div>
    );
};

export default memo(ImageNode);
