
import React, { memo, useCallback } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { FilmSlate, Play, ArrowSquareOut } from '@phosphor-icons/react';
import { useVideoEditor } from '../VideoEditorContext';
import { useOptionalLoroSyncContext } from '../LoroSyncContext';

const VideoEditorNode = ({ data, id }: NodeProps) => {
    const { openEditor } = useVideoEditor();
    const loroSync = useOptionalLoroSyncContext();

    const handleOpenEditor = useCallback(() => {
        // Collect assets from data
        const assets = data.inputs || [];
        let timelineDsl = data.timelineDsl;
        if (loroSync?.doc) {
            const loroNode = loroSync.doc.getMap('nodes').get(id) as any;
            timelineDsl = loroNode?.data?.timelineDsl ?? timelineDsl;
        }
        console.log('Opening editor with assets:', assets);
        openEditor(assets, id, timelineDsl);
    }, [data.inputs, data.timelineDsl, id, loroSync, openEditor]);

    return (
        <div
            className="group relative min-w-[200px] max-w-[400px]"
            onDoubleClick={handleOpenEditor}
        >
            {/* Main Card */}
            <div className="w-full h-full bg-white shadow-md rounded-matrix overflow-hidden transition-all duration-300 hover:shadow-lg ring-1 ring-slate-200">
                <div className="flex flex-col items-center justify-center p-6 gap-3">
                    <div className="rounded-full w-16 h-16 flex justify-center items-center bg-stone-100 group-hover:bg-blue-50 transition-colors">
                        <FilmSlate className="w-8 h-8 text-stone-500 group-hover:text-blue-500 transition-colors" weight="duotone" />
                    </div>
                    <div className="text-center">
                        <div className="text-sm font-bold text-stone-700">Video Editor</div>
                        <div className="text-xs text-gray-400 mt-1">Double-click to open</div>
                    </div>
                </div>

                {/* Footer with inputs info */}
                <div className="bg-slate-50 px-3 py-2 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                        <span className="font-medium">{data.inputs?.length || 0}</span>
                        <span>assets</span>
                    </div>
                    <ArrowSquareOut className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                </div>
            </div>

            {/* Input Handle */}
            <Handle
                type="target"
                position={Position.Left}
                id="assets"
                className="!h-4 !w-4 !-translate-x-2 !border-4 !border-white !bg-slate-400 transition-all hover:!bg-blue-500 hover:scale-125 shadow-sm"
            />

            {/* Output Handle */}
            <Handle
                type="source"
                position={Position.Right}
                id="output"
                className="!h-4 !w-4 !translate-x-2 !border-4 !border-white !bg-slate-400 transition-all hover:!bg-blue-500 hover:scale-125 shadow-sm"
            />
        </div>
    );
};

export default memo(VideoEditorNode);
