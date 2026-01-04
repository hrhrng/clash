'use client';

import { memo, useState, useMemo } from 'react';
import { NodeProps, NodeResizeControl, useReactFlow } from 'reactflow';

const controlStyle = {
    background: '#FF9900',
    border: 'none',
    borderRadius: '50%',
    width: 10,
    height: 10,
};

interface GroupNodeData {
    label?: string;
    isReceiving?: boolean;   // Node is being dragged over this group
    isReleasing?: boolean;   // Node is being dragged out of this group
    justReceived?: boolean;  // Flash animation after receiving a node
    justReleased?: boolean;  // Flash animation after releasing a node
}

const GroupNode = ({ selected, data, id }: NodeProps<GroupNodeData>) => {
    const [label, setLabel] = useState(data.label || 'Group');
    const { getNodes } = useReactFlow();

    // Calculate nesting depth
    const depth = useMemo(() => {
        const nodes = getNodes();
        let currentId = id;
        let level = 0;

        while (currentId) {
            const node = nodes.find(n => n.id === currentId);
            if (!node || !node.parentId) break;
            currentId = node.parentId;
            level++;
        }

        return level;
    }, [id, getNodes]);

    // Generate background color based on depth
    const backgroundColor = useMemo(() => {
        if (selected) return 'bg-[#FFF8F0]';

        // Each level adds more opacity to the slate background
        const opacities = [40, 50, 60, 70, 80]; // 40%, 50%, 60%, etc.
        const opacity = opacities[Math.min(depth, opacities.length - 1)];
        return `bg-slate-100/${opacity}`;
    }, [depth, selected]);

    // Build CSS classes for visual feedback states
    const feedbackClasses = useMemo(() => {
        const classes: string[] = [];
        if (data.isReceiving) classes.push('group-receiving');
        if (data.isReleasing) classes.push('group-releasing');
        if (data.justReceived) classes.push('group-just-received');
        if (data.justReleased) classes.push('group-just-released');
        return classes.join(' ');
    }, [data.isReceiving, data.isReleasing, data.justReceived, data.justReleased]);

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
                className={`h-full w-full border-2 transition-all duration-300 ${selected ? 'border-[#FF9900]' : 'border-slate-300'} ${backgroundColor} ${feedbackClasses}`}
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
