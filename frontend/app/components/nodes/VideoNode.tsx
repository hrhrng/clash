import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { FilmSlate } from '@phosphor-icons/react';
import { useMediaViewer } from '../MediaViewerContext';

const VideoNode = ({ data, selected }: NodeProps) => {
    const [label, setLabel] = useState(data.label || 'Video Node');
    const { openViewer } = useMediaViewer();

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (data.src) {
            openViewer('video', data.src, label);
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
                        setLabel(evt.target.value);
                        data.label = evt.target.value;
                    }}
                />
            </div>

            {/* Main Card */}
            <div
                className={`w-full h-full bg-white shadow-md rounded-matrix overflow-hidden transition-all duration-300 hover:shadow-lg ${selected ? 'ring-4 ring-red-500 ring-offset-2' : 'ring-1 ring-slate-200'
                    }`}
                onDoubleClick={handleDoubleClick}
            >
                {data.src ? (
                    <div className="relative">
                        <video
                            src={data.src}
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
                ) : (
                    <div className="flex h-32 items-center justify-center bg-slate-100 text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                            <FilmSlate size={32} />
                            <span className="text-xs">No Video</span>
                        </div>
                    </div>
                )}
            </div>

            <Handle
                type="target"
                position={Position.Left}
                className="!h-4 !w-4 !-translate-x-2 !border-4 !border-white !bg-slate-400 transition-all hover:!bg-red-500 hover:scale-125 shadow-sm"
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
