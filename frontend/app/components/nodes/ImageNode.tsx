import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Image as ImageIcon } from '@phosphor-icons/react';
import { useMediaViewer } from '../MediaViewerContext';

const ImageNode = ({ data, selected }: NodeProps) => {
    const [label, setLabel] = useState(data.label || 'Image Node');
    const { openViewer } = useMediaViewer();

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (data.src) {
            openViewer('image', data.src, label);
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
                        setLabel(evt.target.value);
                        data.label = evt.target.value;
                    }}
                />
            </div>

            {/* Main Card */}
            <div
                className={`w-full h-full bg-white shadow-md rounded-matrix overflow-hidden transition-all duration-300 hover:shadow-lg ${selected ? 'ring-4 ring-blue-500 ring-offset-2' : 'ring-1 ring-slate-200'
                    }`}
                onDoubleClick={handleDoubleClick}
            >
                {data.src ? (
                    <div className="relative">
                        <img
                            src={data.src}
                            alt={data.label || 'Image Node'}
                            className="w-full h-auto object-cover max-h-[300px]"
                        />
                    </div>
                ) : (
                    <div className="flex h-32 items-center justify-center bg-slate-100 text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                            <ImageIcon size={32} />
                            <span className="text-xs">No Image</span>
                        </div>
                    </div>
                )}
            </div>

            <Handle
                type="target"
                position={Position.Left}
                className="!h-4 !w-4 !-translate-x-2 !border-4 !border-white !bg-slate-400 transition-all hover:!bg-blue-500 hover:scale-125 shadow-sm"
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
