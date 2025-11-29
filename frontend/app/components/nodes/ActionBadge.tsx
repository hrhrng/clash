import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { MagicWand, VideoCamera, Image as ImageIcon, X } from '@phosphor-icons/react';

const ActionBadge = ({ data, selected }: NodeProps) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const actionType = data.actionType || 'image-gen'; // 'image-gen' | 'video-gen'
    const modelName = data.modelName || (actionType === 'video-gen' ? 'Veo3' : 'Nano Banana');
    const params = data.params || { count: 1, resolution: '1024x1024' };

    const Icon = actionType === 'video-gen' ? VideoCamera : ImageIcon;
    const colorClass = actionType === 'video-gen' ? 'text-red-600 bg-red-50 border-red-200' : 'text-blue-600 bg-blue-50 border-blue-200';
    const ringClass = actionType === 'video-gen' ? 'ring-red-500' : 'ring-blue-500';

    return (
        <div className="relative">
            {/* Badge Trigger */}
            <div
                className={`group relative flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md cursor-pointer bg-white ${colorClass} ${selected ? `ring-2 ${ringClass} ring-offset-1` : 'border-slate-200'
                    }`}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className={`flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm`}>
                    <Icon size={14} weight="fill" />
                </div>
                <span className="text-xs font-bold">{actionType === 'video-gen' ? 'Generate Video' : 'Generate Image'}</span>
                <div className="h-4 w-px bg-slate-300 mx-1" />
                <span className="text-[10px] font-medium text-slate-500">{modelName}</span>
            </div>

            {/* Expanded Details (Popover) */}
            {isExpanded && (
                <div className="absolute left-1/2 top-full mt-2 w-48 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700">Action Details</span>
                        <button onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }} className="text-slate-400 hover:text-slate-600">
                            <X size={12} />
                        </button>
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px]">
                            <span className="text-slate-500">Model</span>
                            <span className="font-medium text-slate-900">{modelName}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                            <span className="text-slate-500">Count</span>
                            <span className="font-medium text-slate-900">{params.count}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                            <span className="text-slate-500">Resolution</span>
                            <span className="font-medium text-slate-900">{params.resolution}</span>
                        </div>
                    </div>
                    <button className="mt-3 w-full rounded-md bg-slate-900 py-1 text-[10px] font-medium text-white hover:bg-slate-800">
                        Run Action
                    </button>
                </div>
            )}

            <Handle
                type="target"
                position={Position.Left}
                className="!h-2.5 !w-2.5 !-translate-x-1 !border-2 !border-white !bg-slate-400 transition-all hover:!bg-slate-600"
            />

        </div>
    );
};

export default memo(ActionBadge);
