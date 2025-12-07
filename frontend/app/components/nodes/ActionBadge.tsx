import { memo, useState, useEffect } from 'react';
import { Handle, Position, NodeProps, useReactFlow, useEdges } from 'reactflow';
import { VideoCamera, Image as ImageIcon, CaretDown, Gear, ArrowsOutSimple, Sliders, ArrowUp, Play, Spinner } from '@phosphor-icons/react';
import { useProject } from '../ProjectContext';
import { createAsset } from '../../actions';
import { useAutoLayout } from '../../hooks/useAutoLayout';

const ActionBadge = ({ data, selected, id }: NodeProps) => {
    const [isHovered, setIsHovered] = useState(false);
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // React Flow hooks
    const { projectId } = useProject();
    const { getNodes, getNode, getEdges, addEdges, setNodes } = useReactFlow();
    const { addNodeWithAutoLayout } = useAutoLayout();
    const edges = useEdges();

    // Initialize state from data or defaults
    const [stylization, setStylization] = useState(data.params?.stylization || 100);
    const [weirdness, setWeirdness] = useState(data.params?.weirdness || 0);
    const [diversity, setDiversity] = useState(data.params?.diversity || 0);
    const [count, setCount] = useState(data.params?.count || 1);
    const [model, setModel] = useState(data.modelName || (data.actionType === 'video-gen' ? 'Kling' : 'Nano Banana'));

    const actionType = data.actionType || 'image-gen';
    const Icon = actionType === 'video-gen' ? VideoCamera : ImageIcon;
    const colorClass = actionType === 'video-gen' ? 'text-red-500' : 'text-blue-500';
    const ringClass = actionType === 'video-gen' ? 'ring-red-500' : 'ring-blue-500';

    const models = actionType === 'video-gen' ? ['Kling', 'Veo3'] : ['Nano Banana'];

    // Update data object when state changes (simplified persistence)
    const updateParams = (key: string, value: any) => {
        if (!data.params) data.params = {};
        data.params[key] = value;
    };

    // Auto-run effect
    useEffect(() => {
        console.log('[ActionBadge] useEffect triggered', {
            autoRun: data.autoRun,
            upstreamNodeId: data.upstreamNodeId,
            upstreamNodeIds: data.upstreamNodeIds,
            nodeId: id,
            edgesCount: edges.length,
            isExecuting
        });

        if (data.autoRun && !isExecuting) {
            // Check for single upstream connection
            if (data.upstreamNodeId) {
                const hasConnection = edges.some(e => e.target === id && e.source === data.upstreamNodeId);
                if (!hasConnection) {
                    console.log('[ActionBadge] Waiting for upstream connection (single)...');
                    return;
                }
            }

            // Check for multiple upstream connections
            if (data.upstreamNodeIds && Array.isArray(data.upstreamNodeIds)) {
                const connectedSources = edges.filter(e => e.target === id).map(e => e.source);
                const allConnected = data.upstreamNodeIds.every((uid: string) => connectedSources.includes(uid));

                if (!allConnected) {
                    console.log('[ActionBadge] Waiting for upstream connections (multiple)...', {
                        required: data.upstreamNodeIds,
                        connected: connectedSources
                    });
                    return;
                }
            }

            // Clear the flag to prevent infinite loops
            console.log('[ActionBadge] Executing auto-run!');
            data.autoRun = false;

            // Small delay to ensure React Flow state is fully synced
            setTimeout(() => {
                handleExecute();
            }, 500);
        }
    }, [data.autoRun, edges, data.upstreamNodeId, data.upstreamNodeIds, id, isExecuting]);

    // Execute action: generate image or video
    const handleExecute = async () => {
        setIsExecuting(true);
        setError(null);

        try {
            // Get connected input nodes
            const incomingEdges = getEdges().filter(e => e.target === id);
            const nodes = getNodes();
            const connectedNodes = incomingEdges.map(e =>
                nodes.find(n => n.id === e.source)
            ).filter(Boolean);

            // Get current node to find parent group
            const currentNode = getNode(id);
            const parentId = currentNode?.parentId;

            // Extract prompt from connected text nodes
            // Extract prompt from connected nodes (prioritize PromptNode, then TextNode)
            let prompt = data.prompt || '';
            const promptNode = connectedNodes.find(n => n?.type === 'prompt');
            const textNode = connectedNodes.find(n => n?.type === 'text');

            if (promptNode) {
                prompt = promptNode.data.content || prompt;
            } else if (textNode) {
                prompt = textNode.data.content || prompt;
            }

            if (!prompt) {
                throw new Error('No prompt provided. Connect a text/prompt node.');
            }

            // Generate unique asset name
            const assetName = `${actionType}-${Date.now()}`;

            // Helper for safe fetching with timeout
            const safeFetch = async (url: string, options: RequestInit, timeout = 60000) => {
                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), timeout);
                try {
                    const response = await fetch(url, { ...options, signal: controller.signal });
                    clearTimeout(id);
                    return response;
                } catch (err: any) {
                    clearTimeout(id);
                    if (err.name === 'AbortError') {
                        throw new Error('Request timed out. The server took too long to respond.');
                    }
                    throw new Error(`Network error: ${err.message}`);
                }
            };

            if (actionType === 'image-gen') {
                // Collect connected images
                const imageNodes = connectedNodes.filter(n => n?.type === 'image');
                const base64Images = imageNodes.map(n => {
                    const src = n?.data?.src;
                    // Remove data:image/xxx;base64, prefix if present
                    if (src && src.includes('base64,')) {
                        return src.split('base64,')[1];
                    }
                    return null;
                }).filter(Boolean);

                // Map display model name to backend model name
                let backendModel = 'gemini-2.5-flash-image';
                // Only one model supported now
                // if (model === 'Nano Banana Pro') backendModel = 'gemini-1.5-pro';

                // 1. Call Python backend to generate image (returns task_id immediately)
                const genResponse = await safeFetch('/api/generate/image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt,
                        system_prompt: '',
                        aspect_ratio: '16:9',
                        base64_images: base64Images,
                        model_name: backendModel,
                        callback_url: `${window.location.origin}/api/internal/assets/update`
                    }),
                });

                if (!genResponse.ok) {
                    let errorMessage = 'Image generation failed';
                    try {
                        const contentType = genResponse.headers.get("content-type");
                        if (contentType && contentType.indexOf("application/json") !== -1) {
                            const errorData = await genResponse.json();
                            errorMessage = errorData.detail || errorMessage;
                        } else {
                            errorMessage = await genResponse.text();
                            // Truncate long HTML error pages
                            if (errorMessage.length > 200) errorMessage = errorMessage.substring(0, 200) + '...';
                        }
                    } catch (e) {
                        // Fallback if parsing fails
                        errorMessage = `Server error (${genResponse.status})`;
                    }
                    throw new Error(errorMessage);
                }

                const { task_id } = await genResponse.json();

                // 2. Create asset record in database with PENDING status
                const asset = await createAsset({
                    name: assetName,
                    projectId,
                    storageKey: `pending/${task_id}`,
                    url: '',
                    type: 'image',
                    status: 'pending',
                    taskId: task_id,
                    metadata: JSON.stringify({ prompt, model: backendModel }),
                });

                // 3. Create new image node with auto-layout (collision detection + group expansion)
                const newNode = addNodeWithAutoLayout(
                    {
                        id: asset.id,
                        type: 'image',
                        data: {
                            label: assetName,
                            src: '', // Empty src indicates pending/loading
                            status: 'pending',
                            assetId: asset.id, // Pass asset ID for polling
                        },
                    },
                    id // Use current node ID as reference for placement and parent inheritance
                );

                if (!newNode) {
                    throw new Error('Failed to create image node.');
                }

                // CRITICAL FIX: Update THIS ActionBadge node with the assetId
                // Use setTimeout to ensure this runs AFTER the ImageNode has been added to avoid race condition
                setTimeout(() => {
                    console.log('[ActionBadge] Updating ActionBadge node with assetId:', asset.id);
                    setNodes((nds) => {
                        console.log('[ActionBadge] setNodes callback - current nodes count:', nds.length);
                        const hasImageNode = nds.some(n => n.id === asset.id);
                        console.log('[ActionBadge] ImageNode exists in state:', hasImageNode);

                        return nds.map((n) => {
                            if (n.id === id) {
                                return {
                                    ...n,
                                    data: {
                                        ...n.data,
                                        assetId: asset.id, // Store the generated asset ID
                                        status: 'success'
                                    }
                                };
                            }
                            return n;
                        });
                    });

                    // 4. Connect the action node to the new image node
                    addEdges({
                        id: `${id}-${asset.id}`,
                        source: id,
                        target: asset.id,
                        type: 'default',
                    });
                }, 100);

            } else if (actionType === 'video-gen') {
                // Collect connected images for video generation
                // First image is start frame, second is end frame (if available)
                const imageNodes = connectedNodes.filter(n => n?.type === 'image');

                if (imageNodes.length === 0) {
                    throw new Error('Video generation requires at least one connected image node');
                }

                const base64Images = imageNodes.map(n => {
                    const src = n?.data?.src;
                    // Remove data:image/xxx;base64, prefix if present
                    if (src && src.includes('base64,')) {
                        return src.split('base64,')[1];
                    }
                    return null;
                }).filter(Boolean);

                // 1. Call Python backend to generate video (returns task_id immediately)
                const genResponse = await safeFetch('/api/generate/video', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        base64_images: base64Images,
                        prompt,
                        duration: 5,
                        cfg_scale: 0.5,
                        model: model === 'Kling' ? 'kling-v1' : model.toLowerCase().replace(' ', '-'),
                        callback_url: `${window.location.origin}/api/internal/assets/update`
                    }),
                });

                if (!genResponse.ok) {
                    let errorMessage = 'Video generation failed';
                    try {
                        const contentType = genResponse.headers.get("content-type");
                        if (contentType && contentType.indexOf("application/json") !== -1) {
                            const errorData = await genResponse.json();
                            errorMessage = errorData.detail || errorMessage;
                        } else {
                            errorMessage = await genResponse.text();
                            if (errorMessage.length > 200) errorMessage = errorMessage.substring(0, 200) + '...';
                        }
                    } catch (e) {
                        errorMessage = `Server error (${genResponse.status})`;
                    }
                    throw new Error(errorMessage);
                }

                const { task_id, duration: videoDuration } = await genResponse.json();

                // 2. Create asset record in database with PENDING status
                // Note: We don't have the URL yet, so we use a placeholder or empty string
                // The backend will update this record when generation is complete
                const asset = await createAsset({
                    name: assetName,
                    projectId,
                    storageKey: `pending/${task_id}`, // Placeholder
                    url: '', // Placeholder
                    type: 'video',
                    status: 'pending',
                    taskId: task_id,
                    metadata: JSON.stringify({ prompt, duration: videoDuration, model }),
                });

                // 3. Create new video node with auto-layout (collision detection + group expansion)
                const newNode = addNodeWithAutoLayout(
                    {
                        id: asset.id,
                        type: 'video',
                        data: {
                            label: assetName,
                            src: '', // Empty src indicates pending/loading
                            status: 'pending',
                            assetId: asset.id, // Pass asset ID for polling
                        },
                    },
                    id // Use current node ID as reference for placement and parent inheritance
                );

                if (!newNode) {
                    console.error('Failed to create video node with auto-layout');
                    return;
                }

                // 5. Connect the action node to the new video node
                addEdges({
                    id: `${id}-${asset.id}`,
                    source: id,
                    target: asset.id,
                    type: 'default',
                });
            }

        } catch (err: any) {
            setError(err.message);
            console.error('Execution error:', err);
        } finally {
            setIsExecuting(false);
        }
    };

    return (
        <div
            className="group relative flex flex-col items-center justify-center"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => {
                setIsHovered(false);
                setShowModelDropdown(false);
            }}
        >
            {/* Main Compact Node */}
            <div className={`
                relative flex items-center gap-3 px-3 py-2 rounded-xl bg-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl z-20 min-w-[140px]
                ${selected ? `ring-4 ${ringClass} ring-offset-2` : 'ring-1 ring-slate-200'}
            `}>
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-50 ${colorClass}`}>
                    <Icon size={18} weight="fill" />
                </div>

                <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-0.5">Model</span>
                    <span className="text-xs font-bold text-slate-900 truncate">{model}</span>
                </div>

                <div className="h-6 w-px bg-slate-100 mx-1" />

                <div className="flex flex-col items-center min-w-[24px]">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-0.5">Count</span>
                    <span className="text-xs font-bold text-slate-900">{count}</span>
                </div>

                <div className="h-6 w-px bg-slate-100 mx-1" />

                {/* Execution Button */}
                <button
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${actionType === 'video-gen' ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        handleExecute();
                    }}
                    disabled={isExecuting}
                    title={error || (isExecuting ? 'Generating...' : 'Execute')}
                >
                    {isExecuting ? (
                        <Spinner size={16} className="animate-spin" />
                    ) : (
                        <Play size={16} weight="fill" />
                    )}
                </button>
                {error && (
                    <div className="absolute -bottom-6 left-0 text-[10px] text-red-500 whitespace-nowrap">
                        {error}
                    </div>
                )}



                {/* Dark Hover Configuration Panel */}
                <div className={`
                absolute top-full mt-3 w-64 rounded-2xl bg-[#1a1a1a] p-4 shadow-2xl border border-[#333] z-30 origin-top transition-all duration-200 nodrag
                ${isHovered ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'}
            `}>
                    {/* Invisible bridge to prevent hover loss */}
                    <div className="absolute -top-4 left-0 w-full h-4 bg-transparent" />

                    {/* Arrow pointing up */}
                    <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#1a1a1a] rotate-45 border-t border-l border-[#333]" />

                    <div className="flex flex-col gap-4 text-white">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className={`h-6 w-6 rounded bg-white/10 flex items-center justify-center ${colorClass}`}>
                                    <Icon size={14} weight="fill" />
                                </div>
                                <span className="text-sm font-bold">Configuration</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-medium text-white/40">16:9</span>
                                <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center">
                                    <ArrowUp size={12} weight="bold" />
                                </div>
                            </div>
                        </div>

                        {/* Sliders Section */}
                        <div className="space-y-3" onMouseDown={(e) => e.stopPropagation()}>
                            {/* Stylization Slider */}
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-medium text-white/60">
                                    <span>Stylization</span>
                                    <span>{stylization}</span>
                                </div>
                                <input
                                    type="range" min="0" max="1000"
                                    value={stylization}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        setStylization(val);
                                        updateParams('stylization', val);
                                    }}
                                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>

                            {/* Weirdness Slider */}
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-medium text-white/60">
                                    <span>Weirdness</span>
                                    <span>{weirdness}</span>
                                </div>
                                <input
                                    type="range" min="0" max="1000"
                                    value={weirdness}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        setWeirdness(val);
                                        updateParams('weirdness', val);
                                    }}
                                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>

                            {/* Diversity Slider */}
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-medium text-white/60">
                                    <span>Diversity</span>
                                    <span>{diversity}</span>
                                </div>
                                <input
                                    type="range" min="0" max="1000"
                                    value={diversity}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        setDiversity(val);
                                        updateParams('diversity', val);
                                    }}
                                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>
                        </div>

                        {/* Params */}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
                            {/* Model Selector (Custom Dropdown) */}
                            <div className="relative">
                                <div
                                    className="bg-white/5 rounded-lg p-2 flex flex-col gap-1 hover:bg-white/10 transition-colors cursor-pointer"
                                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                                >
                                    <span className="text-[10px] text-white/40 font-medium">Model</span>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold truncate">{model}</span>
                                        <CaretDown size={10} className="text-white/40" />
                                    </div>
                                </div>

                                {/* Dropdown Menu */}
                                {showModelDropdown && (
                                    <div className="absolute bottom-full left-0 w-full mb-1 bg-[#2a2a2a] border border-[#333] rounded-lg shadow-xl overflow-hidden z-50 flex flex-col">
                                        {models.map(m => (
                                            <div
                                                key={m}
                                                className={`px-3 py-2 text-xs font-medium cursor-pointer transition-colors ${model === m ? 'bg-blue-500 text-white' : 'text-white/80 hover:bg-white/10'}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setModel(m);
                                                    data.modelName = m;
                                                    setShowModelDropdown(false);
                                                }}
                                            >
                                                {m}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Count Input */}
                            <div className="bg-white/5 rounded-lg p-2 flex flex-col gap-1 hover:bg-white/10 transition-colors cursor-pointer">
                                <span className="text-[10px] text-white/40 font-medium">Count</span>
                                <div className="flex items-center justify-between gap-2">
                                    <input
                                        type="number" min="1" max="10"
                                        className="w-full bg-transparent text-xs font-bold text-white focus:outline-none p-0 border-none"
                                        value={count}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            setCount(val);
                                            updateParams('count', val);
                                        }}
                                        onKeyDown={(e) => e.stopPropagation()}
                                        onMouseDown={(e) => e.stopPropagation()}
                                    />
                                    <span className="text-[10px] text-white/40">Images</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action nodes only have input (target) */}
                {/* Input Handle - Moved inside for better positioning context */}
                <Handle
                    type="target"
                    position={Position.Left}
                    style={{ left: -6, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, zIndex: 100, background: '#94a3b8', border: '2px solid white' }}
                    className={`transition-all hover:scale-125 shadow-sm hover:!bg-slate-600`}
                />
            </div>

            {/* Output handle for generated assets (Hidden from user, used for programmatic connections) */}
            <Handle
                type="source"
                position={Position.Right}
                isConnectable={false}
                className={`!h-3 !w-3 !translate-x-1 !border-2 !border-white !bg-slate-400 transition-all hover:scale-125 shadow-sm hover:!bg-slate-600 z-10 !opacity-0 !pointer-events-none`}
            />

        </div>
    );
};

export default memo(ActionBadge);
