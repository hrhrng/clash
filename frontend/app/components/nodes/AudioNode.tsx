import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { SpeakerHigh } from '@phosphor-icons/react';

const AudioNode = ({ data, selected }: NodeProps) => {
    const [label, setLabel] = useState(data.label || 'Audio Node');

    return (
        <div
            className="group relative min-w-[240px]"
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
            <div className={`w-full h-full bg-white shadow-md rounded-matrix overflow-hidden transition-all duration-300 hover:shadow-lg ${selected ? 'ring-4 ring-purple-500 ring-offset-2' : 'ring-1 ring-slate-200'
                }`}>
                <div className="flex items-center gap-3 p-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                        <SpeakerHigh size={20} weight="fill" />
                    </div>
                    <div className="flex-1 overflow-hidden">
                        {data.src ? (
                            <audio controls className="h-6 w-full max-w-[180px] mt-1" src={data.src} />
                        ) : (
                            <div className="text-[10px] text-slate-400">No audio source</div>
                        )}
                    </div>
                </div>
            </div>

            <Handle
                type="target"
                position={Position.Left}
                className="!h-4 !w-4 !-translate-x-2 !border-4 !border-white !bg-slate-400 transition-all hover:!bg-purple-500 hover:scale-125 shadow-sm"
            />
            <Handle
                type="source"
                position={Position.Right}
                className="!h-4 !w-4 !translate-x-2 !border-4 !border-white !bg-slate-400 transition-all hover:!bg-purple-500 hover:scale-125 shadow-sm"
            />
        </div>
    );
};

export default memo(AudioNode);
