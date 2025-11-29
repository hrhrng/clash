import { memo, useState } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { FilmSlate } from '@phosphor-icons/react';
import { useMediaViewer } from '../MediaViewerContext';

import { getAsset } from '../../actions';
import { useEffect } from 'react';

const VideoNode = ({ data, selected, id }: NodeProps) => {
    const [label, setLabel] = useState(data.label || 'Video Node');
    const { openViewer } = useMediaViewer();
    const { setNodes } = useReactFlow();
    const [status, setStatus] = useState(data.status || (data.src ? 'completed' : 'pending'));
    const [videoUrl, setVideoUrl] = useState(data.src);

    useEffect(() => {
        if (status === 'pending' && data.assetId) {
            const interval = setInterval(async () => {
                try {
                    const asset = await getAsset(data.assetId);
                    if (asset && asset.status === 'completed') {
                        setStatus('completed');
                        setVideoUrl(asset.url);
                        setNodes((nds) =>
                            nds.map((node) => {
                                if (node.id === id) {
                                    return {
                                        ...node,
                                        data: {
                                            ...node.data,
                                            src: asset.url,
                                            status: 'completed',
                                        },
                                    };
                                }
                                return node;
                            })
                        );
                        clearInterval(interval);
                    } else if (asset && asset.status === 'failed') {
                        setStatus('failed');
                        clearInterval(interval);
                    }
                } catch (e) {
                    console.error("Polling error:", e);
                }
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [status, data.assetId, id, setNodes]);

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (videoUrl && status === 'completed') {
            openViewer('video', videoUrl, label);
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
                            src={videoUrl}
                            controls={false} // Disable default controls in node view to prevent conflict
                            className="w-full h-auto max-h-[300px] object-cover pointer-events-none" // Disable pointer events on video to allow double click on container
                        />
                        <div className="absolute top-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
                            Video
                        </div>
                        {/* Play overlay hint */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 bg-black/10">
                            <div className="rounded-full bg-white/20 p-2 backdrop-blur-sm">
                                <FilmSlate size={24} className="text-white" weight="fill" />
                            </div>
                        </div>
                    </div>
                ) : status === 'pending' ? (
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
