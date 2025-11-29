'use client';

import { memo, useState } from 'react';
import { NodeProps, NodeResizeControl } from 'reactflow';

const controlStyle = {
    background: '#FF9900',
    border: 'none',
    borderRadius: '50%',
    width: 10,
    height: 10,
};

const GroupNode = ({ selected, data }: NodeProps) => {
    const [label, setLabel] = useState(data.label || 'Group');

    return (
        <>
            {selected && (
                <>
                    <NodeResizeControl style={controlStyle} position="top-left" />
                    <NodeResizeControl style={controlStyle} position="top-right" />
                    <NodeResizeControl style={controlStyle} position="bottom-left" />
                    <NodeResizeControl style={controlStyle} position="bottom-right" />
                </>
            )}

            <div
                className={`h-full w-full border-2 rounded-matrix transition-all duration-300 ${selected ? 'border-[#FF9900] bg-[#FFF8F0]' : 'border-slate-200 bg-slate-50/5'
                    }`}
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
            </div>
        </>
    );
};

export default memo(GroupNode);
