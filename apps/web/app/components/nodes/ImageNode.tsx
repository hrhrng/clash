import { memo, useState, useEffect } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { Image as ImageIcon, TextT } from '@phosphor-icons/react';
import { useMediaViewer } from '../MediaViewerContext';
import { normalizeStatus, isActiveStatus, type AssetStatus } from '../../../lib/assetStatus';

import { resolveAssetUrl } from '../../../lib/utils/assets';

const ImageNode = ({ data, selected, id }: NodeProps) => {
    const [label, setLabel] = useState(data.label || 'Image Node');
    const { openViewer } = useMediaViewer();
    const { setNodes } = useReactFlow();
    const [status, setStatus] = useState<AssetStatus>(normalizeStatus(data.status) || (data.src ? 'completed' : 'generating'));
    const [imageUrl, setImageUrl] = useState(data.src);
    const [description, setDescription] = useState(data.description || '');
    const [showDescription, setShowDescription] = useState(false);

    // Debug logging
    console.log(`[ImageNode ${id}] Render:`, { assetId: data.assetId, src: data.src, status: data.status, currentStatus: status, imageUrl });

    // Sync state with props when they change (e.g. from Loro sync)
    useEffect(() => {
        if (data.src && data.src !== imageUrl) {
            setImageUrl(data.src);
        }
        const newStatus = normalizeStatus(data.status);
        if (newStatus !== status) {
            setStatus(newStatus);
        }
        if (data.description && data.description !== description) {
            setDescription(data.description);
        }
    }, [data.src, data.status, data.description, imageUrl, status, description]);

    // Loro sync handles state updates - no polling needed

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (imageUrl && (status === 'completed' || status === 'fin')) {
            openViewer('image', resolveAssetUrl(imageUrl), label);
        }
    };

    return (
        <div
            className="group relative min-w-[200px] max-w-[400px]"
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
                className={`w-full h-full bg-white shadow-md rounded-matrix overflow-hidden transition-all duration-300 hover:shadow-lg ${selected ? 'ring-4 ring-blue-500 ring-offset-2' : 'ring-1 ring-slate-200'
                    }`}
                onDoubleClick={handleDoubleClick}
            >
                {(status === 'completed' || status === 'fin') && imageUrl ? (
                    <div className="relative">
                        <img
                            src={resolveAssetUrl(imageUrl)}
                            alt={label}
                            className="w-full h-auto object-cover max-h-[300px]"
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
                    <div className="relative">
                        <img
                            src={resolveAssetUrl(imageUrl)}
                            alt={label}
                            className="w-full h-auto object-cover max-h-[300px] opacity-70"
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
                            <span className="text-xs font-medium animate-pulse">Generating Image...</span>
                        </div>
                    </div>
                ) : status === 'failed' ? (
                    <div className="flex h-32 items-center justify-center bg-red-50 text-red-400">
                        <div className="flex flex-col items-center gap-2">
                            <ImageIcon size={32} weight="duotone" />
                            <span className="text-xs font-medium">Generation Failed</span>
                        </div>
                    </div>
                ) : (
                    <div className="flex h-32 items-center justify-center bg-slate-100 text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                            <ImageIcon size={32} />
                            <span className="text-xs">No Image</span>
                        </div>
                    </div>
                )}

                {/* Description Box */}
                {showDescription && (
                    <div className="p-3 bg-slate-50 border-t border-slate-100" onDoubleClick={(e) => e.stopPropagation()}>
                        <textarea
                            className="w-full h-24 text-xs text-slate-600 bg-transparent resize-none focus:outline-none"
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
                className="!h-4 !w-4 !-translate-x-2 !border-4 !border-white !bg-slate-400 transition-all hover:!bg-blue-500 hover:scale-125 shadow-sm !opacity-0 !pointer-events-none"
            />
            <Handle
                type="source"
                position={Position.Right}
                className="!h-4 !w-4 !translate-x-2 !border-4 !border-white !bg-slate-400 transition-all hover:!bg-blue-500 hover:scale-125 shadow-sm"
            />
        </div>
    );
};

export default memo(ImageNode);
