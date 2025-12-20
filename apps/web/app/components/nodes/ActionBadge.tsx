import { memo, useState, useEffect, useCallback } from 'react';
import { Handle, Position, NodeProps, useReactFlow, useEdges } from 'reactflow';
import { VideoCamera, Image as ImageIcon, CaretDown, X, Play, Spinner, ArrowsInLineVertical } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useProject } from '../ProjectContext';
import { useOptionalLoroSyncContext } from '../LoroSyncContext';
import { createAsset } from '../../actions';
import { useAutoLayout } from '../../hooks/useAutoLayout';
import { generateSemanticId } from '@/lib/utils/semanticId';
import MilkdownEditor from '../MilkdownEditor';

const PromptActionNode = ({ data, selected, id }: NodeProps) => {
    const [isHovered, setIsHovered] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // React Flow hooks
    const { projectId } = useProject();
    const { getNodes, getNode, getEdges, addEdges, setNodes } = useReactFlow();
    const { addNodeWithAutoLayout } = useAutoLayout();
    const loroSync = useOptionalLoroSyncContext();
    const edges = useEdges();

    // Prompt editing state
    const [label, setLabel] = useState(data.label || 'Prompt');
    const [content, setContent] = useState(data.content || '# Prompt\nEnter your prompt here...');

    // Initialize state from data or defaults
    const [stylization, setStylization] = useState(data.params?.stylization || 100);
    const [weirdness, setWeirdness] = useState(data.params?.weirdness || 0);
    const [diversity, setDiversity] = useState(data.params?.diversity || 0);
    const [count, setCount] = useState(data.params?.count || 1);
    const [model, setModel] = useState(data.modelName || (data.actionType === 'video-gen' ? 'Kling' : 'Nano Banana'));
    const [actionType, setActionType] = useState<'image-gen' | 'video-gen'>(data.actionType || 'image-gen');

    const Icon = actionType === 'video-gen' ? VideoCamera : ImageIcon;
    const colorClass = actionType === 'video-gen' ? 'text-red-500' : 'text-blue-500';
    const bgClass = actionType === 'video-gen' ? 'bg-red-50' : 'bg-blue-50';
    const ringClass = actionType === 'video-gen' ? 'ring-red-500' : 'ring-blue-500';

    const models = actionType === 'video-gen' ? ['Kling'] : ['Nano Banana'];

    // Sync content and label when data changes (from Loro or other sources)
    useEffect(() => {
        if (data.label && data.label !== label) {
            setLabel(data.label);
        }
        if (data.content !== undefined && data.content !== content) {
            setContent(data.content);
        }
    }, [data.label, data.content]);

    // Update params helper
    const updateParams = (key: string, value: any) => {
        if (!data.params) data.params = {};
        data.params[key] = value;
    };

    // Prompt editing handlers (from PromptNode)
    const handleDoubleClick = useCallback(() => {
        setShowModal(true);
    }, []);

    const handleSave = useCallback(() => {
        setShowModal(false);
        // Update the node data locally
        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === id) {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            label,
                            content,
                        },
                    };
                }
                return node;
            })
        );
        
        // Sync to Loro
        console.log(`[PromptActionNode] Syncing update to Loro: ${id}`);
        if (loroSync?.connected) {
            loroSync.updateNode(id, {
                data: {
                    label,
                    content,
                }
            });
        }
    }, [id, label, content, setNodes, loroSync]);

    const handleCancel = useCallback(() => {
        setShowModal(false);
        // Reset to original values
        setLabel(data.label || 'Prompt');
        setContent(data.content || '# Prompt\nEnter your prompt here...');
    }, [data.label, data.content]);

    const handleLabelChange = (evt: React.ChangeEvent<HTMLInputElement>) => {
        const newLabel = evt.target.value;
        setLabel(newLabel);
    };

    // Type switching handler
    const handleTypeSwitch = () => {
        const newType = actionType === 'image-gen' ? 'video-gen' : 'image-gen';
        setActionType(newType);
        
        // Update model to match new type
        const defaultModel = newType === 'video-gen' ? 'Kling' : 'Nano Banana';
        setModel(defaultModel);
        
        // Sync to node data
        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === id) {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            actionType: newType,
                            modelName: defaultModel,
                        },
                    };
                }
                return node;
            })
        );

        // Sync to Loro
        if (loroSync?.connected) {
            loroSync.updateNode(id, {
                data: {
                    actionType: newType,
                    modelName: defaultModel,
                }
            });
        }
    };

    // Auto-run effect
    useEffect(() => {
        const requiredUpstreams: string[] = Array.isArray(data.upstreamNodeIds) ? data.upstreamNodeIds : [];
        console.log('[ActionBadge] useEffect triggered', {
            autoRun: data.autoRun,
            upstreamNodeIds: requiredUpstreams,
            nodeId: id,
            edgesCount: edges.length,
            isExecuting
        });

        if (data.autoRun && !isExecuting) {
            if (requiredUpstreams.length > 0) {
                const connectedSources = edges.filter(e => e.target === id).map(e => e.source);
                const allConnected = requiredUpstreams.every((uid: string) => connectedSources.includes(uid));

                if (!allConnected) {
                    console.log('[ActionBadge] Waiting for upstream connections...', {
                        required: requiredUpstreams,
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
    }, [data.autoRun, edges, data.upstreamNodeIds, id, isExecuting]);

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

            // PRIORITY 1: Use embedded content if available
            let prompt = content && content.trim() !== '# Prompt\nEnter your prompt here...' ? content : '';
            
            // PRIORITY 2: Fallback to connected prompt/text nodes
            if (!prompt) {
                const promptNode = connectedNodes.find(n => n?.type === 'prompt');
                const textNode = connectedNodes.find(n => n?.type === 'text');

                if (promptNode) {
                    prompt = promptNode.data.content || '';
                } else if (textNode) {
                    prompt = textNode.data.content || '';
                }
            }

            // PRIORITY 3: Fallback to data.prompt (legacy)
            if (!prompt) {
                prompt = data.prompt || '';
            }

            if (!prompt || prompt.trim() === '') {
                throw new Error('No prompt provided. Please edit the node or connect a text/prompt node.');
            }

            // Capture and clear pre-allocated asset ID (provided by backend; treat as single-use)
            const preAllocatedAssetId = data.preAllocatedAssetId;
            if (preAllocatedAssetId) {
                setNodes((nds) =>
                    nds.map((n) =>
                        n.id === id ? { ...n, data: { ...n.data, preAllocatedAssetId: undefined } } : n
                    )
                );
            }

            // Generate unique asset name (prefer pre-allocated assetId once; otherwise request semantic ID)
            const assetName = preAllocatedAssetId || await generateSemanticId(projectId);

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

            const getReferenceImageUrls = (sources: string[]) => {
                const urls: string[] = [];
                sources.forEach((src) => {
                    if (!src) return;
                    if (src.startsWith('http://') || src.startsWith('https://')) {
                        urls.push(src);
                    } else if (src.includes('base64,')) {
                        // Also pass base64 images - backend will upload to R2
                        console.log('[ActionBadge] Including base64 image for backend processing');
                        urls.push(src);
                    }
                });
                return urls;
            };

            if (actionType === 'image-gen') {
                // Collect connected images for reference
                const imageNodes = connectedNodes.filter(n => n?.type === 'image');
                const referenceImageUrls = getReferenceImageUrls(imageNodes.map(n => n?.data?.src));

                // ============================================
                // Create pending node - Loro will handle generation
                // ============================================
                const pendingNodeId = assetName;
                console.log('[ActionBadge] Creating pending image node:', pendingNodeId);
                console.log('[ActionBadge] Prompt:', prompt);

                // Create the pending node in React state
                const newNode = addNodeWithAutoLayout(
                    {
                        id: pendingNodeId,
                        type: 'image',
                        data: {
                            label: assetName,
                            src: '', // Empty src = generating
                            status: 'generating',
                            prompt: prompt, // Loro uses this for generation
                            referenceImageUrls, // Pass reference images
                            aspectRatio: '16:9',
                        },
                    },
                    id
                );

                if (!newNode) {
                    throw new Error('Failed to create pending image node.');
                }

                // Sync pending node to Loro - server will detect and process
                console.log('[ActionBadge] loroSync status:', !!loroSync, 'connected:', loroSync?.connected);
                if (loroSync?.connected) {
                    console.log('[ActionBadge] Syncing pending node to Loro (server will process):', newNode.id);
                    loroSync.addNode(newNode.id, newNode);
                } else {
                    console.warn('[ActionBadge] ⚠️ loroSync not connected - node will not be processed');
                }

                // Add edge
                const edgeId = `${id}-${pendingNodeId}`;
                addEdges({
                    id: edgeId,
                    source: id,
                    target: pendingNodeId,
                    type: 'default',
                });

                // Sync edge
                if (loroSync?.connected) {
                    loroSync.addEdge(edgeId, {
                        id: edgeId,
                        source: id,
                        target: pendingNodeId,
                        type: 'default',
                    });
                }

                // Update ActionBadge status
                setNodes((nds) => nds.map((n) => {
                    if (n.id === id) {
                        return {
                            ...n,
                            data: {
                                ...n.data,
                                preAllocatedAssetId: undefined,
                                status: 'success'
                            }
                        };
                    }
                    return n;
                }));

                console.log('[ActionBadge] ✅ Pending node created and synced. Loro server will process.');
            } else if (actionType === 'video-gen') {
                // Collect connected images for video generation
                // First image is start frame, second is end frame (if available)
                const imageNodes = connectedNodes.filter(n => n?.type === 'image');

                // Debug: log full connected nodes data
                console.log('[ActionBadge] All connected nodes:', connectedNodes.map(n => ({
                    id: n?.id,
                    type: n?.type,
                    data: n?.data,
                })));
                console.log('[ActionBadge] Filtered image nodes:', imageNodes.map(n => ({
                    id: n?.id,
                    src: n?.data?.src,
                    status: n?.data?.status,
                })));

                if (imageNodes.length === 0) {
                    throw new Error('Video generation requires at least one connected image node');
                }

                const referenceImageUrls = getReferenceImageUrls(imageNodes.map(n => n?.data?.src));
                
                // Debug: log image sources
                console.log('[ActionBadge] Image nodes found:', imageNodes.length);
                console.log('[ActionBadge] Image sources:', imageNodes.map(n => n?.data?.src));
                console.log('[ActionBadge] Filtered reference URLs:', referenceImageUrls);

                // ============================================
                // Create pending video node - Loro will handle generation
                // Same pattern as image generation
                // ============================================
                const pendingNodeId = assetName;
                console.log('[ActionBadge] Creating pending video node:', pendingNodeId);
                console.log('[ActionBadge] Prompt:', prompt);
                console.log('[ActionBadge] Reference images:', referenceImageUrls);

                // Create the pending video node in React state
                const newNode = addNodeWithAutoLayout(
                    {
                        id: pendingNodeId,
                        type: 'video',
                        data: {
                            label: assetName,
                            src: '', // Empty src = generating
                            status: 'generating',
                            prompt: prompt, // Loro uses this for generation
                            referenceImageUrls, // Pass reference images
                            duration: 5, // Default duration
                            model: model === 'Kling' ? 'kling-v1' : model.toLowerCase().replace(' ', '-'),
                        },
                    },
                    id
                );

                if (!newNode) {
                    throw new Error('Failed to create pending video node.');
                }

                // Sync pending node to Loro - server will detect and process
                console.log('[ActionBadge] loroSync status:', !!loroSync, 'connected:', loroSync?.connected);
                if (loroSync?.connected) {
                    console.log('[ActionBadge] Syncing pending video node to Loro (server will process):', newNode.id);
                    loroSync.addNode(newNode.id, newNode);
                } else {
                    console.warn('[ActionBadge] ⚠️ loroSync not connected - node will not be processed');
                }

                // Add edge
                const edgeId = `${id}-${pendingNodeId}`;
                addEdges({
                    id: edgeId,
                    source: id,
                    target: pendingNodeId,
                    type: 'default',
                });

                // Sync edge
                if (loroSync?.connected) {
                    loroSync.addEdge(edgeId, {
                        id: edgeId,
                        source: id,
                        target: pendingNodeId,
                        type: 'default',
                    });
                }

                // Update ActionBadge status
                setNodes((nds) => nds.map((n) => {
                    if (n.id === id) {
                        return {
                            ...n,
                            data: {
                                ...n.data,
                                preAllocatedAssetId: undefined,
                                status: 'success'
                            }
                        };
                    }
                    return n;
                }));

                console.log('[ActionBadge] ✅ Pending video node created and synced. Loro server will process.');
            }

        } catch (err: any) {
            setError(err.message);
            console.error('Execution error:', err);
        } finally {
            setIsExecuting(false);
        }
    };

    // Modal content (from PromptNode)
    const modalContent = showModal ? (
        <AnimatePresence>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-8">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-white/80 backdrop-blur-sm"
                    onClick={handleCancel}
                />

                {/* Modal */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="relative z-10 w-full max-w-5xl h-[85vh] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col border border-gray-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header with Title Input */}
                    <div className="px-12 pt-8 pb-2 flex justify-between items-start">
                        <input
                            type="text"
                            value={label}
                            onChange={handleLabelChange}
                            placeholder="Untitled Prompt"
                            className="w-full text-4xl font-bold text-gray-900 placeholder:text-gray-300 bg-transparent border-none outline-none focus:outline-none"
                            style={{
                                fontFamily: 'var(--font-space-grotesk), var(--font-inter), sans-serif',
                                letterSpacing: '-0.02em'
                            }}
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={handleSave}
                                className="px-4 py-2 text-sm font-medium text-white bg-black rounded-lg hover:bg-gray-800 transition-colors"
                            >
                                Save
                            </button>
                            <button
                                onClick={handleCancel}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" weight="bold" />
                            </button>
                        </div>
                    </div>

                    {/* Editor Content */}
                    <div className="flex-1 overflow-y-auto bg-white">
                        <MilkdownEditor value={content} onChange={setContent} />
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    ) : null;

    return (
        <>
            <div
                className="group relative"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => {
                    setIsHovered(false);
                    setShowModelDropdown(false);
                }}
            >
                {/* Floating Title Input */}
                <div
                    className="absolute -top-8 left-4 z-10"
                    onDoubleClick={(e) => e.stopPropagation()}
                >
                    <input
                        className={`bg-transparent text-lg font-bold ${colorClass} focus:outline-none`}
                        value={label}
                        onChange={handleLabelChange}
                        placeholder="Prompt"
                    />
                </div>

                {/* Main Node Container */}
                <div 
                    className={`w-[320px] h-[220px] ${bgClass} rounded-xl flex flex-col overflow-hidden transition-all duration-300 hover:shadow-xl ${
                        selected ? `ring-4 ${ringClass} ring-offset-2` : 'ring-1 ring-gray-200'
                    }`}
                    onDoubleClick={handleDoubleClick}
                >
                    {/* Content Preview Area */}
                    <div className="flex-1 p-4 relative overflow-hidden cursor-pointer flex flex-col">
                        {/* Prompt Area (No scrollbar, pure fade-out) */}
                        <div className="flex-1 relative overflow-hidden mb-1">
                            {/* Prompt Text */}
                            <div className="prose prose-sm prose-slate prose-p:text-gray-600 prose-headings:text-gray-800 prose-p:leading-tight">
                                <MarkdownPreview content={content} />
                            </div>
                            
                            {/* Bottom fade-out overlay to indicate overflow without scrollbar */}
                            <div className={`absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-${actionType === 'video-gen' ? 'red' : 'blue'}-50 to-transparent pointer-events-none`} />
                        </div>
                        
                        {/* Reference Images Section (Compact) */}
                        {(() => {
                            // Get connected image nodes
                            const incomingEdges = edges.filter(e => e.target === id);
                            const nodes = getNodes();
                            const connectedImages = incomingEdges
                                .map(e => nodes.find(n => n.id === e.source))
                                .filter(n => n?.type === 'image' && n?.data?.src)
                                .map(n => ({
                                    id: n!.id,
                                    src: n!.data.src,
                                    label: n!.data.label || 'Image'
                                }));
                            
                            if (connectedImages.length === 0) return null;
                            
                            return (
                                <div className="space-y-1 pt-1.5 border-t border-gray-200/40 flex-shrink-0">
                                    <div className="flex items-center gap-1">
                                        <ImageIcon size={9} weight="fill" className={`${colorClass} opacity-50`} />
                                        <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">
                                            Refs ({connectedImages.length})
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1 pb-0.5">
                                        {connectedImages.map((img) => (
                                            <div
                                                key={img.id}
                                                className="relative"
                                                title={img.label}
                                            >
                                                <img
                                                    src={img.src}
                                                    alt={img.label}
                                                    className={`w-8 h-8 object-cover rounded-md border-[1.5px] transition-all ${
                                                        actionType === 'video-gen' 
                                                            ? 'border-red-100 hover:border-red-300' 
                                                            : 'border-blue-100 hover:border-blue-300'
                                                    } shadow-sm hover:scale-105`}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    {/* Control Bar */}
                    <div className="px-3 py-2 bg-white/60 backdrop-blur-sm border-t border-gray-200/50 flex items-center gap-2">
                        {/* Type Switch Button */}
                        <button
                            className={`nodrag flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-all hover:scale-105 active:scale-95 ${
                                actionType === 'video-gen' ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                            }`}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleTypeSwitch();
                            }}
                            title={`Switch to ${actionType === 'video-gen' ? 'Image' : 'Video'} Generation`}
                        >
                            <ArrowsInLineVertical size={16} weight="bold" />
                        </button>

                        {/* Model Display */}
                        <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none">Model</span>
                            <span className="text-xs font-bold text-slate-900 truncate">{model}</span>
                        </div>

                        {/* Count Display */}
                        <div className="flex flex-col items-center min-w-[32px]">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none">Count</span>
                            <span className="text-xs font-bold text-slate-900">{count}</span>
                        </div>

                        {/* Execution Button */}
                        <button
                            className={`nodrag flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                                actionType === 'video-gen' ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                            }`}
                            onClick={(e) => {
                                console.log('[PromptActionNode] Run button clicked!', { id, isExecuting, actionType });
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
                    </div>

                    {error && (
                        <div className="absolute -bottom-6 left-0 text-[10px] text-red-500 whitespace-nowrap">
                            {error}
                        </div>
                    )}
                </div>

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

                {/* Handles */}
                <Handle
                    type="target"
                    position={Position.Left}
                    style={{ left: -6, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, zIndex: 100, background: '#94a3b8', border: '2px solid white' }}
                    className="transition-all hover:scale-125 shadow-sm hover:!bg-slate-600"
                />

                {/* Output handle (hidden, for programmatic connections) */}
                <Handle
                    type="source"
                    position={Position.Right}
                    isConnectable={false}
                    className="!h-3 !w-3 !translate-x-1 !border-2 !border-white !bg-slate-400 transition-all hover:scale-125 shadow-sm hover:!bg-slate-600 z-10 !opacity-0 !pointer-events-none"
                />
            </div>

            {/* Render modal in portal */}
            {typeof window !== 'undefined' && modalContent && createPortal(modalContent, document.body)}
        </>
    );
};

// Simple markdown preview component (from PromptNode)
const MarkdownPreview = ({ content }: { content: string }) => {
    return (
        <div
            className="prose prose-sm max-w-none prose-slate prose-headings:font-bold prose-headings:text-slate-900 prose-p:text-slate-700 prose-a:text-blue-600 prose-code:text-blue-600 prose-code:bg-blue-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded"
            dangerouslySetInnerHTML={{
                __html: content
                    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
                    .replace(/\*(.*)\*/gim, '<em>$1</em>')
                    .replace(/\n/gim, '<br />')
            }}
        />
    );
};

export default memo(PromptActionNode);
