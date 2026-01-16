
import React, { memo, useCallback } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { FilmSlate, Play, ArrowSquareOut } from '@phosphor-icons/react';
import { useVideoEditor } from '../VideoEditorContext';
import { useOptionalLoroSyncContext } from '../LoroSyncContext';
import { resolveAssetUrl } from '../../../lib/utils/assets';
import { normalizeStatus, isActiveStatus } from '../../../lib/assetStatus';

const VideoEditorNode = ({ data, id }: NodeProps) => {
    const { openEditor } = useVideoEditor();
    const loroSync = useOptionalLoroSyncContext();
    const reactFlow = useReactFlow();

    const handleOpenEditor = useCallback(() => {
        const assets = data.inputs || [];
        console.log('[VideoEditorNode] handleOpenEditor called with assets:', assets.length, assets);
        let timelineDsl = data.timelineDsl;
        if (loroSync?.doc) {
            const loroNode = loroSync.doc.getMap('nodes').get(id) as any;
            timelineDsl = loroNode?.data?.timelineDsl ?? timelineDsl;
        }
        const nodes = reactFlow.getNodes();
        const edges = reactFlow.getEdges();
        const connectedAssetIds = new Set(
            edges
                .filter((edge) => edge.target === id && edge.targetHandle === 'assets')
                .map((edge) => edge.source)
        );
        const inputSrcs = new Set(
            (assets || []).map((asset: any) => asset?.src).filter(Boolean)
        );
        const seenKeys = new Set<string>();
        const availableAssets = nodes
            .filter((node) => ['image', 'video', 'audio'].includes(node.type || ''))
            .filter((node) => node.data?.src && !connectedAssetIds.has(node.id))
            .filter((node) => {
                if (node.type !== 'video') return true;
                const statusValue = node.data?.status;
                if (typeof statusValue !== 'string') return true;
                return !isActiveStatus(normalizeStatus(statusValue));
            })
            .map((node) => ({
                id: node.id,
                type: node.type as 'image' | 'video' | 'audio',
                src: resolveAssetUrl(node.data.src),
                name: node.data?.label || node.type,
                width: node.data?.naturalWidth,
                height: node.data?.naturalHeight,
                duration: node.data?.duration,
                sourceNodeId: node.id,
            }))
            .filter((asset) => {
                if (inputSrcs.has(asset.src)) return false;
                const key = asset.sourceNodeId || asset.src;
                if (seenKeys.has(key)) return false;
                seenKeys.add(key);
                return true;
            });
        openEditor(assets, id, timelineDsl, availableAssets);
    }, [data.inputs, data.timelineDsl, id, loroSync, openEditor, reactFlow]);

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
