'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import ReactFlow, {
    Background,
    BackgroundVariant,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Edge,
    Node,
    Panel,
    NodeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { motion } from 'framer-motion';
import {
    FilmSlate,
    TextT,
    ChatText,
    Article,
    Image as ImageIcon,
    Plus,
    PaintBrush,
    SpeakerHigh,
    MagicWand,
    ArrowCounterClockwise,
    ArrowClockwise,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { Project, Message } from '@generated/client';
import ChatbotCopilot from './ChatbotCopilot';
import { saveProjectState, updateProjectName } from '../actions';
import VideoNode from './nodes/VideoNode';
import ImageNode from './nodes/ImageNode';
import TextNode from './nodes/TextNode';
import AudioNode from './nodes/AudioNode';
import PromptActionNode from './nodes/ActionBadge'; // Renamed: ActionBadge -> PromptActionNode
import GroupNode from './nodes/GroupNode';
import VideoEditorNode from './nodes/VideoEditorNode';
import { MediaViewerProvider } from './MediaViewerContext';
import { ProjectProvider } from './ProjectContext';
import { VideoEditorProvider } from './VideoEditorContext';
import { getLayoutedElements, getSmartLayoutedElements } from '@/lib/utils/elkLayout';
import {
    useLayoutManager,
    getAbsoluteRect,
    getAbsolutePosition,
    rectContains,
    rectOverlaps,
    determineGroupOwnership,
    updateNodeOwnership,
    recursiveGroupScale,
    applyGroupScales,
    resolveCollisions,
    applyResolution,
    createMesh,
    getGroupNodes,
    isDescendant,
} from '@/lib/layout';
import { generateSemanticId } from '@/lib/utils/semanticId';
import { resolveAssetUrl } from '@/lib/utils/assets';
import { useLoroSync } from '../hooks/useLoroSync';
import { LoroSyncProvider } from './LoroSyncContext';
import { MODEL_CARDS } from '@clash/shared-types';

interface ProjectEditorProps {
    project: Project & { messages: Message[] };
    initialPrompt?: string;
}

const nodeTypes = {
    video: VideoNode,
    image: ImageNode,
    text: TextNode,
    context: TextNode, // Remap context to TextNode
    audio: AudioNode,
    'action-badge': PromptActionNode, // Merged: Prompt + Action
    prompt: PromptActionNode, // Backward compatibility: old prompt nodes render as PromptActionNode
    group: GroupNode,
    'video-editor': VideoEditorNode,
};

const defaultImageModel = MODEL_CARDS.find((card) => card.kind === 'image');
const defaultVideoModel = MODEL_CARDS.find((card) => card.kind === 'video');

const sanitizeNodes = (nodes: Node[]): Node[] => {
    const nodeIds = new Set(nodes.map(n => n.id));
    return nodes.map(node => {
        if (node.parentId && !nodeIds.has(node.parentId)) {
            console.warn(`[Sanitize] Removing invalid parentId ${node.parentId} from node ${node.id}`);
            const { parentId, ...rest } = node;
            // Reset to absolute position (or keep relative as absolute)
            // Since parent is missing, we can't calculate true absolute, so we just keep the values
            return { ...rest, parentId: undefined, extent: undefined };
        }
        return node;
    });
};

// Migration: Convert old prompt nodes to new PromptActionNode format
const migrateOldNodes = (nodes: Node[]): Node[] => {
    return nodes.map(node => {
        if (node.type === 'prompt') {
            console.log(`[Migration] Converting old PromptNode ${node.id} to PromptActionNode`);
            const targetDefaults = (node.data.actionType || 'image-gen') === 'video-gen'
                ? defaultVideoModel
                : defaultImageModel;
            return {
                ...node,
                type: 'action-badge',
                data: {
                    ...node.data,
                    actionType: node.data.actionType || 'image-gen', // Default to image generation
                    content: node.data.content || '# Prompt\nEnter your prompt here...',
                    modelId: node.data.modelId || targetDefaults?.id || 'nano-banana-pro',
                    model: node.data.modelId || targetDefaults?.id || 'nano-banana-pro',
                    modelParams: { ...(targetDefaults?.defaultParams ?? {}), ...(node.data.modelParams ?? {}) },
                    referenceMode: node.data.referenceMode || targetDefaults?.input.referenceMode || 'single',
                },
                // Update dimensions for new layout
                width: 320,
                height: 220,
                style: {
                    ...node.style,
                    width: 320,
                    height: 220,
                }
            };
        }
        return node;
    });
};

export default function ProjectEditor({ project, initialPrompt }: ProjectEditorProps) {
    // IMPORTANT: Start with empty canvas - Loro sync will populate from server
    // This ensures Loro is the single source of truth for nodes/edges
    // Legacy: project.nodes/edges from DB are now ignored
    const initialNodes: Node[] = [];
    const initialEdges: Edge[] = [];

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [selectedTool, setSelectedTool] = useState<string | null>(null);
    const [projectName, setProjectName] = useState(project.name);

    // Loro CRDT sync
    const loroSync = useLoroSync({
        projectId: project.id,
        syncServerUrl: process.env.NEXT_PUBLIC_LORO_SYNC_URL || 'ws://localhost:8787',
        onNodesChange: (syncedNodes) => {
            // Loro is the SINGLE SOURCE OF TRUTH - use its state directly
            // Only preserve UI-specific state (selected, dragging) and spatial state during interaction
            setNodes((currentNodes) => {
                const currentNodesMap = new Map(currentNodes.map(n => [n.id, n]));
                
                return syncedNodes.map(syncedNode => {
                    const currentNode = currentNodesMap.get(syncedNode.id);
                    
                    // Preserve spatial and UI state for nodes being interacted with
                    // This prevents server updates from reverting local drag/resize/group changes
                    if (currentNode && (currentNode.selected || currentNode.dragging)) {
                        return {
                            ...syncedNode,           // Trust Loro for data (content, status, etc.)
                            position: currentNode.position,  // Preserve local position during drag
                            parentId: currentNode.parentId,  // Preserve group membership during interaction
                            selected: currentNode.selected,
                            dragging: currentNode.dragging,
                        };
                    }
                    
                    // Trust Loro completely for non-interacting nodes
                    return syncedNode;
                });
            });
        },
        onEdgesChange: (syncedEdges) => {
            setEdges(syncedEdges);
        },
    });



    // File upload state
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [pendingNodeType, setPendingNodeType] = useState<string | null>(null);

    // Sidebar state
    const [sidebarWidth, setSidebarWidth] = useState(384);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    // Selection state
    const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);

    // Custom onNodesChange to handle recursive resizing
    const handleNodesChange = useCallback((changes: NodeChange[]) => {
        onNodesChange(changes);

        // Debug: Log all changes

        // Handle node deletions - sync to Loro (Fallback if onNodesDelete doesn't fire)
        const removeChanges = changes.filter(c => c.type === 'remove');
        if (removeChanges.length > 0 && loroSync.connected) {
            removeChanges.forEach(change => {
                if (change.type === 'remove') {
                    loroSync.removeNode(change.id);
                }
            });
        }

        // Check for dimension changes (resizing)
        const resizeChanges = changes.filter(c => c.type === 'dimensions');
        if (resizeChanges.length > 0) {
            setNodes((currentNodes) => {
                let updatedNodes = [...currentNodes];
                let hasUpdates = false;

                resizeChanges.forEach(change => {
                    if (change.type === 'dimensions' && change.dimensions) {
                        const node = updatedNodes.find(n => n.id === change.id);
                        if (!node) return;

                        // Update the node's dimensions in our temp list
                        const nodeIndex = updatedNodes.findIndex(n => n.id === change.id);
                        if (nodeIndex !== -1) {
                            updatedNodes[nodeIndex] = {
                                ...updatedNodes[nodeIndex],
                                width: change.dimensions.width,
                                height: change.dimensions.height,
                                style: {
                                    ...updatedNodes[nodeIndex].style,
                                    width: change.dimensions.width,
                                    height: change.dimensions.height,
                                }
                            };
                        }

                        // CASE 1: If a GROUP is resized, check if any nodes should become children
                        if (node.type === 'group') {
                            const resizedGroup = updatedNodes[nodeIndex];
                            const groupAbsRect = getAbsoluteRect(resizedGroup, updatedNodes);

                            // Check all non-descendant nodes to see if they're now inside this group
                            updatedNodes.forEach((otherNode, otherIndex) => {
                                // Skip the group itself and its existing descendants
                                if (otherNode.id === node.id) return;
                                if (isDescendant(otherNode.id, node.id, updatedNodes)) return;

                                // Skip nodes that are ancestors of this group (can't put parent inside child)
                                if (isDescendant(node.id, otherNode.id, updatedNodes)) return;

                                const otherAbsRect = getAbsoluteRect(otherNode, updatedNodes);
                                const isInside = rectContains(groupAbsRect, otherAbsRect);
                                const wasInside = otherNode.parentId === node.id;

                                if (isInside && !wasInside) {
                                    // Node is now inside the group but wasn't before
                                    const groupAbsPos = getAbsolutePosition(resizedGroup, updatedNodes);
                                    const relativePos = {
                                        x: otherAbsRect.x - groupAbsPos.x,
                                        y: otherAbsRect.y - groupAbsPos.y,
                                    };
                                    updatedNodes[otherIndex] = {
                                        ...otherNode,
                                        parentId: node.id,
                                        position: relativePos,
                                        extent: undefined,
                                    };
                                    hasUpdates = true;

                                    // Sync to Loro
                                    if (loroSync.connected) {
                                        loroSync.updateNode(otherNode.id, {
                                            parentId: node.id,
                                            position: relativePos,
                                        });
                                    }
                                }
                            });
                        }

                        // CASE 2: If a node with parentId is resized, scale parent groups
                        if (node.parentId) {
                            const scales = recursiveGroupScale(change.id, updatedNodes);
                            if (scales.size > 0) {
                                updatedNodes = applyGroupScales(updatedNodes, scales);
                                hasUpdates = true;

                                // Resolve collisions caused by scaling
                                const mesh = createMesh({ cellWidth: 50, cellHeight: 50, maxColumns: 10 });
                                for (const groupId of scales.keys()) {
                                    const result = resolveCollisions(updatedNodes, groupId, mesh, { maxIterations: 10 });
                                    if (result.steps.length > 0) {
                                        updatedNodes = applyResolution(updatedNodes, result);
                                    }
                                }
                            }
                        }
                    }
                });

                return hasUpdates ? updatedNodes : currentNodes;
            });
        }
    }, [onNodesChange, setNodes, loroSync]);

    // Reliable sync handlers
    const onNodesDelete = useCallback((deletedNodes: Node[]) => {
        if (loroSync.connected) {
            deletedNodes.forEach(node => {
                loroSync.removeNode(node.id);
            });
        }
    }, [loroSync]);

    const onNodeDragStop = useCallback((event: React.MouseEvent, node: Node, allNodes: Node[]) => {
        // Use new layout system for group ownership detection (OVERLAP based)
        const nodeAbsRect = getAbsoluteRect(node, allNodes);
        const ownership = determineGroupOwnership(nodeAbsRect, node.id, allNodes, node.parentId);

        let finalNode = { ...node };
        const mesh = createMesh({ cellWidth: 50, cellHeight: 50, maxColumns: 10 });

        // Track ownership change for visual feedback
        const ownershipChanged = ownership.newParentId !== node.parentId;
        const oldParentId = node.parentId;
        const newParentId = ownership.newParentId;

        // Update parent if changed
        if (ownershipChanged) {

            finalNode = {
                ...node,
                parentId: newParentId,
                position: ownership.relativePosition,
                extent: undefined,
                // For group nodes, ensure they remain editable and above parent
                ...(node.type === 'group' && newParentId ? {
                    draggable: true,
                    selectable: true,
                    style: {
                        ...node.style,
                        zIndex: (Number(allNodes.find(n => n.id === newParentId)?.style?.zIndex ?? 0)) + 1,
                    }
                } : {})
            };
        }

        // Apply all updates in a single setNodes call
        // Use flushSync to ensure state is updated synchronously so subsequent drags work immediately
        flushSync(() => {
            setNodes((nds) => {
                // Apply ownership change for the dragged node
                let updatedNodes = nds.map((n) => n.id === node.id ? finalNode : n);

                // If the dragged node is a GROUP, check if it now covers any other nodes
                if (node.type === 'group') {
                    const draggedGroup = updatedNodes.find(n => n.id === node.id)!;
                    const groupAbsRect = getAbsoluteRect(draggedGroup, updatedNodes);
                    const groupAbsPos = getAbsolutePosition(draggedGroup, updatedNodes);

                    updatedNodes = updatedNodes.map((otherNode) => {
                        // Skip the group itself and its existing descendants
                        if (otherNode.id === node.id) return otherNode;
                        if (isDescendant(otherNode.id, node.id, updatedNodes)) return otherNode;

                        // Skip nodes that are ancestors of this group
                        if (isDescendant(node.id, otherNode.id, updatedNodes)) return otherNode;

                        const otherAbsRect = getAbsoluteRect(otherNode, updatedNodes);
                        const isInside = rectContains(groupAbsRect, otherAbsRect);
                        const wasInside = otherNode.parentId === node.id;

                        if (isInside && !wasInside) {
                            // Node is now inside the group
                            const relativePos = {
                                x: otherAbsRect.x - groupAbsPos.x,
                                y: otherAbsRect.y - groupAbsPos.y,
                            };

                            // Sync to Loro
                            if (loroSync.connected) {
                                loroSync.updateNode(otherNode.id, {
                                    parentId: node.id,
                                    position: relativePos,
                                });
                            }

                            return {
                                ...otherNode,
                                parentId: node.id,
                                position: relativePos,
                                extent: undefined,
                            };
                        }

                        return otherNode;
                    });
                }

                // Auto-scale parent groups if needed
                const scales = recursiveGroupScale(node.id, updatedNodes);
                if (scales.size > 0) {
                    updatedNodes = applyGroupScales(updatedNodes, scales);

                    // Resolve collisions caused by scaling
                    for (const groupId of scales.keys()) {
                        const result = resolveCollisions(updatedNodes, groupId, mesh, { maxIterations: 10 });
                        if (result.steps.length > 0) {
                            updatedNodes = applyResolution(updatedNodes, result);
                        }
                    }
                }

                // Clear receiving/releasing states and set flash animations for ownership changes
                updatedNodes = updatedNodes.map((n) => {
                    if (n.type !== 'group') return n;

                    // Determine if this group needs flash animation
                    const shouldFlashReceived = ownershipChanged && n.id === newParentId;
                    const shouldFlashReleased = ownershipChanged && n.id === oldParentId;

                    // Clear drag states and set flash states
                    if (n.data?.isReceiving || n.data?.isReleasing || shouldFlashReceived || shouldFlashReleased) {
                        return {
                            ...n,
                            data: {
                                ...n.data,
                                isReceiving: false,
                                isReleasing: false,
                                justReceived: shouldFlashReceived,
                                justReleased: shouldFlashReleased,
                            }
                        };
                    }
                    return n;
                });

                const targetNode = updatedNodes.find(n => n.id === node.id);
                return updatedNodes;
            });
        });

        // Clear flash animations after 500ms
        if (ownershipChanged && (oldParentId || newParentId)) {
            setTimeout(() => {
                setNodes((nds) => nds.map((n) => {
                    if (n.type !== 'group') return n;
                    if (n.id === oldParentId || n.id === newParentId) {
                        return {
                            ...n,
                            data: {
                                ...n.data,
                                justReceived: false,
                                justReleased: false,
                            }
                        };
                    }
                    return n;
                }));
            }, 500);
        }

        // Sync to Loro
        if (loroSync.connected) {
            loroSync.updateNode(finalNode.id, {
                position: finalNode.position,
                parentId: finalNode.parentId,
                extent: finalNode.extent,
                style: finalNode.style
            });
        }
    }, [setNodes, loroSync]);

    const onSelectionChange = useCallback(({ nodes }: { nodes: Node[] }) => {
        setSelectedNodes(nodes);
    }, []);

    // Handle node drag to show receiving/releasing visual feedback on groups
    const onNodeDrag = useCallback((event: React.MouseEvent, node: Node, allNodes: Node[]) => {
        // Skip if dragging a group (we don't show feedback for group-to-group)
        if (node.type === 'group') return;

        console.log('[onNodeDrag] FIRED! node:', node.id);

        // TEST: 无条件让所有group高亮
        setNodes((nds) => nds.map((n) => {
            if (n.type !== 'group') return n;
            console.log('[onNodeDrag] Setting group', n.id, 'isReceiving=true');
            return {
                ...n,
                data: {
                    ...n.data,
                    isReceiving: true,
                }
            };
        }));
    }, [setNodes]);

    // Sync local state when prop changes (e.g. after agent action revalidation)
    useEffect(() => {
        if (project.nodes) {
            const newNodes = (project.nodes as unknown as Node[]) || [];

            setNodes((currentNodes) => {
                const currentNodesMap = new Map(currentNodes.map(n => [n.id, n]));
                const newNodesMap = new Map(newNodes.map(n => [n.id, n]));

                // 1. Update existing nodes (preserve local position/dimensions if they exist)
                // We only want to update DATA from the server, not position/layout, to prevent jumping.
                // Unless it's a collaborative app where we expect position updates from others? 
                // Assuming single-user for now: Trust local position.

                const mergedNodes = newNodes.map(newNode => {
                    const currentNode = currentNodesMap.get(newNode.id);
                    if (currentNode) {
                        return {
                            ...newNode,
                            // PRESERVE LOCAL POSITION & DIMENSIONS
                            position: currentNode.position,
                            width: currentNode.width,
                            height: currentNode.height,
                            style: currentNode.style,
                            // Also preserve parentId if we trust local hierarchy more? 
                            // Maybe not, let's trust server for structure but local for layout.
                            // Actually, if we just dragged it, local parentId is newer.
                            parentId: currentNode.parentId,
                            extent: currentNode.extent,
                        };
                    }
                    return newNode;
                });

                // 2. Add local-only nodes (that haven't been saved yet)
                const localNodesToKeep = currentNodes.filter(n => !newNodesMap.has(n.id));

                return [...sanitizeNodes(mergedNodes), ...localNodesToKeep];
            });
        }
        if (project.edges) {
            // Similar logic for edges? Edges don't have positions, but they have 'data'.
            // For now, just replacing edges is usually fine unless we are editing edge data.
            setEdges((project.edges as unknown as Edge[]) || []);
        }
    }, [project.nodes, project.edges, setNodes, setEdges]);

    // Sync connected assets to VideoEditorNode
    useEffect(() => {
        setNodes((currentNodes) => {
            let hasChanges = false;
            const updatedNodes = currentNodes.map((node) => {
                if (node.type === 'video-editor') {
                    // Find all edges connected to this node's 'assets' handle
                    const connectedEdges = edges.filter(
                        (e) => e.target === node.id && e.targetHandle === 'assets'
                    );

                    // Map edges to source nodes and extract asset data
                    const newInputs = connectedEdges.map((edge) => {
                        const sourceNode = currentNodes.find((n) => n.id === edge.source);
                        if (!sourceNode) return null;

                        // Extract relevant data based on node type
                        if (['image', 'video', 'audio'].includes(sourceNode.type || '')) {
                            return {
                                id: sourceNode.id,
                                type: sourceNode.type,
                                src: resolveAssetUrl(sourceNode.data.src),
                                name: sourceNode.data.label || sourceNode.type,
                                // Add other fields if needed
                            };
                        }
                        return null;
                    }).filter(Boolean); // Remove nulls

                    // Compare with existing inputs to avoid unnecessary updates
                    const currentInputs = node.data.inputs || [];
                    const isDifferent = JSON.stringify(newInputs) !== JSON.stringify(currentInputs);

                    if (isDifferent) {
                        hasChanges = true;
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                inputs: newInputs,
                            },
                        };
                    }
                }
                return node;
            });

            return hasChanges ? updatedNodes : currentNodes;
        });
    }, [edges, nodes, setNodes]); // Intentionally omitting 'nodes' from dependency to avoid infinite loop, 
    // but we need access to current nodes. setNodes(callback) gives us current nodes.
    // However, we need source node data. If source node data changes (e.g. image generated), 
    // we want to update. 
    // If we omit 'nodes', we won't trigger on source node updates.
    // If we include 'nodes', we risk loops.
    // SOLUTION: Use a specific selector or check for specific data changes.
    // For now, let's try including 'nodes' but rely on the JSON.stringify check to stop the loop.
    // React Flow's setNodes with callback is safe, but the effect triggering is the issue.
    // Let's add 'nodes' to dependency but rely on the strict check.

    // Auto-save logic removed: Loro is the single source of truth.


    // Custom handleEdgesChange to sync edge deletions to Loro
    const handleEdgesChange = useCallback((changes: import('reactflow').EdgeChange[]) => {
        onEdgesChange(changes);

        // Handle edge deletions - sync to Loro
        const removeChanges = changes.filter(c => c.type === 'remove');
        if (removeChanges.length > 0 && loroSync.connected) {
            removeChanges.forEach(change => {
                if (change.type === 'remove') {
                    loroSync.removeEdge(change.id);
                }
            });
        }
    }, [onEdgesChange, loroSync]);

    const onConnect = useCallback(
        (params: Connection | Edge) => {
            setEdges((eds) => {
                const newEdges = addEdge(params, eds);
                // Find the newly added edge and sync to Loro
                const addedEdge = newEdges.find(e => 
                    e.source === (params as Connection).source && 
                    e.target === (params as Connection).target
                );
                if (addedEdge && loroSync.connected) {
                    loroSync.addEdge(addedEdge.id, addedEdge);
                }
                return newEdges;
            });
        },
        [setEdges, loroSync]
    );

    // Keyboard shortcuts for Undo/Redo
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Check if focus is in an input/textarea to avoid triggering undo when typing
            const activeElement = document.activeElement;
            const isInput = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA' || (activeElement as HTMLElement)?.contentEditable === 'true';

            if (isInput) return;

            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                if (e.shiftKey) {
                    if (loroSync.canRedo) {
                        e.preventDefault();
                        loroSync.redo();
                    }
                } else {
                    if (loroSync.canUndo) {
                        e.preventDefault();
                        loroSync.undo();
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [loroSync]);

    const assetTools = [
        // Context merged into TextNode
        { id: 'image', label: 'Image', icon: ImageIcon },
        { id: 'video', label: 'Video', icon: FilmSlate },
        { id: 'audio', label: 'Audio', icon: SpeakerHigh },
        { id: 'video-editor', label: 'Editor', icon: FilmSlate },
        { id: 'group', label: 'Group', icon: Plus },
    ];

    const actionTools = [
        { id: 'action-badge-image', label: 'Prompt + Gen Image', icon: ImageIcon },
        { id: 'action-badge-video', label: 'Prompt + Gen Video', icon: FilmSlate },
    ];

    const addNode = (type: string, extraData: any = {}) => {
        let nodeType = type;
        let nodeData: any = { label: `New ${type}`, ...extraData };
        const imageModelDefaults = {
            modelId: defaultImageModel?.id ?? 'nano-banana-pro',
            model: defaultImageModel?.id ?? 'nano-banana-pro',
            modelParams: { ...(defaultImageModel?.defaultParams ?? {}) },
            referenceMode: defaultImageModel?.input.referenceMode ?? 'single',
        };
        const videoModelDefaults = {
            modelId: defaultVideoModel?.id ?? 'kling-image2video',
            model: defaultVideoModel?.id ?? 'kling-image2video',
            modelParams: { ...(defaultVideoModel?.defaultParams ?? {}) },
            referenceMode: defaultVideoModel?.input.referenceMode ?? 'single',
        };

        if (type === 'action-badge-image' || type === 'image-gen') {
            nodeType = 'action-badge';
            nodeData = { 
                actionType: 'image-gen', 
                ...imageModelDefaults,
                content: '# Prompt\nEnter your prompt here...',
                ...nodeData 
            };
        } else if (type === 'action-badge-video' || type === 'video-gen') {
            nodeType = 'action-badge';
            nodeData = { 
                actionType: 'video-gen', 
                ...videoModelDefaults,
                content: '# Prompt\nEnter your prompt here...',
                ...nodeData 
            };
        } else if (type === 'text') {
            nodeData = { label: 'Text Node', content: '# Hello World\nDouble click to edit.', ...nodeData };
        } else if (type === 'context') {
            // Remap context creation to text node style but keep label if needed, or just treat as text
            nodeData = { label: 'Context', content: '# Context\nAdd background information here...', ...nodeData };
            // Note: We are using TextNode component for 'context' type now (via nodeTypes map), 
            // so it will render as a TextNode.
        } else if (type === 'video-editor') {
            nodeData = { label: 'Video Editor', inputs: [], ...nodeData };
        }

        // For group nodes, calculate z-index
        let zIndex: number | undefined = undefined;
        if (nodeType === 'group') {
            if (extraData.parentId) {
                // Nested Group: Must be ABOVE parent
                const parent = nodes.find(n => n.id === extraData.parentId);
                const parentZIndex = Number(parent?.style?.zIndex ?? 0);
                zIndex = parentZIndex + 1;
            } else {
                // Root Group: Keep existing logic (behind other groups)
                const groupNodes = nodes.filter((n) => n.type === 'group');
                const minZIndex = groupNodes.reduce((min, n) => {
                    const nodeZIndex = Number(n.style?.zIndex ?? 0);
                    return Math.min(min, nodeZIndex);
                }, 0);
                zIndex = minZIndex - 1;
            }
        }

        const newNodeId = extraData.id || `${nodes.length + 1}-${Date.now()}`;

        setNodes((nds) => {
            // 1. Determine Dimensions FIRST
            let defaultWidth = 300;
            let defaultHeight = 300;

            if (nodeType === 'group') {
                defaultWidth = 400;
                defaultHeight = 400;
            } else if (nodeType === 'text') {
                defaultWidth = 300;
                defaultHeight = 400;
            } else if (nodeType === 'action-badge') {
                defaultWidth = 320;
                defaultHeight = 220;
            } else if (nodeType === 'prompt') {
                defaultWidth = 300;
                defaultHeight = 150;
            } else if (nodeType === 'video-editor') {
                defaultWidth = 250;
                defaultHeight = 200;
            }

            // 2. Determine Position with Collision Detection
            let parentId = extraData.parentId;

            // Validate parentId exists
            if (parentId) {
                const parentExists = nds.find(n => n.id === parentId);
                if (!parentExists) {
                    console.warn(`Parent node ${parentId} not found in current nodes list (size: ${nds.length}), creating node at root level`);
                    parentId = undefined;
                }
            }

            let targetPos = { x: 100, y: 100 };

            // If no parentId, try to place to the right of the entire graph
            if (!parentId && nds.length > 0) {
                let maxX = -Infinity;
                let lastNodeY = 100; // Default Y if no nodes found (unlikely)

                nds.forEach(n => {
                    // Only consider root nodes or top-level groups
                    if (!n.parentId) {
                        const x = n.position.x + (n.width || Number(n.style?.width) || 300);
                        if (x > maxX) {
                            maxX = x;
                            // Track the Y of the right-most node to align with it
                            lastNodeY = n.position.y;
                        }
                    }
                });

                if (maxX > -Infinity) {
                    // Place to the right of the right-most node, aligned to its TOP (stable Y)
                    targetPos = {
                        x: maxX + 100,
                        y: lastNodeY // Align with the last node's Y instead of centering
                    };
                }
            }

            const upstreamList = Array.isArray(extraData.upstreamNodeIds) ? extraData.upstreamNodeIds : [];

            if (parentId) {
                // Start at top-left of group
                targetPos = { x: 50, y: 50 };

                // 1. Upstream Node Placement (Highest Priority)
                const primaryUpstream = upstreamList[0];
                if (primaryUpstream) {
                    const upstreamNode = nds.find(n => n.id === primaryUpstream);
                    if (upstreamNode) {
                        // Calculate Upstream Node's Absolute Position
                        const upstreamAbsPos = getAbsolutePosition(upstreamNode, nds);
                        const upstreamWidth = upstreamNode.width || Number(upstreamNode.style?.width) || 300;
                        const upstreamHeight = upstreamNode.height || Number(upstreamNode.style?.height) || 300;
                        const upstreamCenterY = upstreamAbsPos.y + (upstreamHeight / 2);

                        // Calculate Parent Group's Absolute Position
                        const parentGroup = nds.find(n => n.id === parentId);
                        const parentAbsPos = parentGroup ? getAbsolutePosition(parentGroup, nds) : { x: 0, y: 0 };

                        // Calculate Target Position Relative to Parent Group
                        // We want the new node to be to the right of the upstream node
                        const targetAbsX = upstreamAbsPos.x + upstreamWidth + 80;
                        const targetAbsY = upstreamCenterY - (defaultHeight / 2);

                        let relativeX = targetAbsX - parentAbsPos.x;
                        let relativeY = targetAbsY - parentAbsPos.y;

                        // Ensure the node is at least somewhat inside the group (or will cause expansion)
                        // If relativeX is negative, it means upstream is to the left of the group.
                        // We should probably place it at the left edge (padding) so the group expands left?
                        // Or just let it be negative and let the user/layout handle it?
                        // Current resize logic only handles expansion to right/bottom.
                        // So we should clamp to minimum padding if we want to avoid "jumping" or weirdness.
                        // BUT, if we clamp, it might be far from upstream.
                        // Let's try to place it at least at x=50 if it would be negative, to keep it inside.
                        // This effectively "pulls" the node into the group.

                        if (relativeX < 50) relativeX = 50;
                        if (relativeY < 50) relativeY = 50;

                        targetPos = {
                            x: relativeX,
                            y: relativeY
                        };
                    }
                }
                // 2. Layout Direction (Right vs Bottom)
                else {
                    const children = nds.filter(n => n.parentId === parentId);
                    if (children.length > 0) {
                        if (extraData.layoutDirection === 'right') {
                            // Find the right-most child
                            const rightMostChild = children.reduce((prev, current) => {
                                return (prev.position.x > current.position.x) ? prev : current;
                            });
                            const childWidth = rightMostChild.width || Number(rightMostChild.style?.width) || defaultWidth;

                            targetPos = {
                                x: rightMostChild.position.x + childWidth + 50,
                                y: rightMostChild.position.y // Keep same Y level
                            };
                        } else {
                            // Default: Vertical stacking (bottom)
                            const bottomChild = children.reduce((prev, current) => {
                                return (prev.position.y > current.position.y) ? prev : current;
                            });
                            const childHeight = bottomChild.height || Number(bottomChild.style?.height) || 200;
                            targetPos = {
                                x: 50,
                                y: bottomChild.position.y + childHeight + 50
                            };
                        }
                    }
                }
            } else {
                // Root level placement (e.g. new groups)
                if (nodeType === 'group') {
                    // Find the right-most group to avoid overlap
                    const existingGroups = nds.filter(n => n.type === 'group');
                    if (existingGroups.length > 0) {
                        const rightMostGroup = existingGroups.reduce((prev, current) => {
                            return (prev.position.x > current.position.x) ? prev : current;
                        });
                        const groupWidth = rightMostGroup.width || Number(rightMostGroup.style?.width) || 400;
                        targetPos = {
                            x: rightMostGroup.position.x + groupWidth + 100, // Add extra spacing for groups
                            y: rightMostGroup.position.y
                        };
                    }
                }
            }


            // Use mesh-based layout only for nodes inside groups
            // Root-level nodes use the calculated rightmost position directly
            let position = targetPos;
            const mesh = createMesh({ cellWidth: 50, cellHeight: 50, maxColumns: 10 });

            if (parentId) {
                // Inside a group: use mesh for collision-free placement
                const siblingRects = nds
                    .filter(n => n.parentId === parentId && n.type !== 'group')
                    .map(n => getAbsoluteRect(n, nds));
                position = mesh.findNonOverlappingPosition(
                    targetPos,
                    { width: defaultWidth, height: defaultHeight },
                    siblingRects
                );
            } else {
                // Root level: use the rightmost position directly
                // Only adjust if there's a direct overlap at the exact position
                const directRect = { x: targetPos.x, y: targetPos.y, width: defaultWidth, height: defaultHeight };
                const rootNodes = nds.filter(n => !n.parentId);
                const hasDirectOverlap = rootNodes.some(n => {
                    const nodeRect = getAbsoluteRect(n, nds);
                    return rectOverlaps(directRect, nodeRect);
                });

                if (hasDirectOverlap) {
                    // Shift right by default width + spacing to avoid overlap
                    position = { x: targetPos.x + defaultWidth + 50, y: targetPos.y };
                }
            }

            const newNode: Node = {
                id: newNodeId,
                type: nodeType,
                data: nodeData,
                position,
                parentId,
                width: defaultWidth,
                height: defaultHeight,
                // CRITICAL FIX: Do NOT set extent: 'parent'.
                // If set to 'parent', React Flow restricts the node's movement to within the parent's bounds.
                // This prevents the user from dragging the node OUT of the group to detach it.
                // We want to allow dragging out, so we leave extent undefined.
                extent: undefined,
                style: nodeType === 'group' ? { width: defaultWidth, height: defaultHeight, zIndex } : { width: defaultWidth, height: defaultHeight },
                className: nodeType === 'group' ? 'group-node' : '',
            };

            // 3. Update nodes with Recursive Group Resizing using new layout system
            let updatedNodes = [...nds, newNode];

            // Use new recursive group scale
            const scales = recursiveGroupScale(newNode.id, updatedNodes);
            if (scales.size > 0) {
                updatedNodes = applyGroupScales(updatedNodes, scales);

                // Resolve collisions caused by scaling
                for (const groupId of scales.keys()) {
                    const result = resolveCollisions(updatedNodes, groupId, mesh, { maxIterations: 10 });
                    if (result.steps.length > 0) {
                        updatedNodes = applyResolution(updatedNodes, result);
                    }
                }
            }

            const finalNodes = updatedNodes;

            // Sync new node to Loro
            const createdNode = finalNodes.find(n => n.id === newNodeId);
            if (createdNode && loroSync.connected) {
                loroSync.addNode(newNodeId, createdNode);
            }

            return finalNodes;
        });
        return newNodeId;
    };

    const updateNode = useCallback((nodeId: string, updates: Partial<Node>) => {
        setNodes((nds) =>
            nds.map((node) => {
                if (node.id !== nodeId) return node;
                return {
                    ...node,
                    ...updates,
                    // Merge data so callers can update nested props like autoRun/preAllocatedAssetId
                    data: {
                        ...(node.data || {}),
                        ...(updates.data || {}),
                    },
                };
            })
        );
    }, [setNodes]);

    const handleToolClick = (type: string) => {
        if (['image', 'video', 'audio'].includes(type)) {
            setPendingNodeType(type);
            if (fileInputRef.current) {
                // Reset value to ensure onChange fires even if selecting the same file again
                fileInputRef.current.value = '';

                // Set accept attribute based on type
                if (type === 'image') fileInputRef.current.accept = 'image/*';
                else if (type === 'video') fileInputRef.current.accept = 'video/*';
                else if (type === 'audio') fileInputRef.current.accept = 'audio/*';

                fileInputRef.current.click();
            }
        } else {
            addNode(type);
        }
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && pendingNodeType) {
            // Generate a unique ID for tracking the placeholder node
            const placeholderId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            
            // Create local preview URL for immediate display
            const localPreviewUrl = URL.createObjectURL(file);
            
            // Create placeholder node with 'uploading' status and local preview
            addNode(pendingNodeType, { 
                id: placeholderId,
                label: file.name, 
                status: 'uploading',
                src: localPreviewUrl  // Show local preview during upload
            });
            
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('projectId', project.id);
                formData.append('type', pendingNodeType);

                const res = await fetch('/api/upload/asset', {
                    method: 'POST',
                    body: formData,
                });

                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(errorText || 'Failed to upload to R2');
                }

                const { url, storageKey } = await res.json();
                
                // Update the placeholder node with the uploaded URL
                setNodes((nds) =>
                    nds.map((node) =>
                        node.id === placeholderId
                            ? {
                                ...node,
                                data: {
                                    ...node.data,
                                    src: storageKey || url,
                                    storageKey,
                                    status: 'completed',
                                },
                            }
                            : node
                    )
                );
                
                // Sync to Loro
                if (loroSync.connected) {
                    loroSync.updateNode(placeholderId, {
                        data: {
                            src: storageKey || url,
                            storageKey,
                            status: 'completed',
                        }
                    });
                }
            } catch (err) {
                console.error('Failed to upload file to R2', err);
                // Update node to show failed status
                setNodes((nds) =>
                    nds.map((node) =>
                        node.id === placeholderId
                            ? {
                                ...node,
                                data: {
                                    ...node.data,
                                    status: 'failed',
                                },
                            }
                            : node
                    )
                );
            } finally {
                setPendingNodeType(null);
                if (event.target) {
                    event.target.value = '';
                }
            }
        }
    };


    const handleCommand = useCallback(async (command: any) => {
        console.log('Executing command:', command);
        switch (command.type) {
            case 'ADD_NODE':
                let { type, data, ...rest } = command.payload;

                // Map legacy/agent types to action-badge
                if (type === 'image-gen') {
                    type = 'action-badge';
                    data = { actionType: 'image-gen', modelId: defaultImageModel?.id ?? 'nano-banana-pro', model: defaultImageModel?.id ?? 'nano-banana-pro', modelParams: { ...(defaultImageModel?.defaultParams ?? {}) }, ...data };
                    if (!rest.width) rest.width = 200;
                    if (!rest.height) rest.height = 60;
                } else if (type === 'video-gen') {
                    type = 'action-badge';
                    data = { actionType: 'video-gen', modelId: defaultVideoModel?.id ?? 'kling-image2video', model: defaultVideoModel?.id ?? 'kling-image2video', modelParams: { ...(defaultVideoModel?.defaultParams ?? {}) }, ...data };
                    if (!rest.width) rest.width = 200;
                    if (!rest.height) rest.height = 60;
                }

                // Validate parentId if present
                if (rest.parentId && !nodes.find(n => n.id === rest.parentId)) {
                    console.warn(`Parent node ${rest.parentId} not found in command, creating node at root level`);
                    delete rest.parentId;
                }

                // Generate semantic ID
                const nodeId = await generateSemanticId(project.id);

                const newNode: Node = {
                    id: nodeId,
                    type,
                    data,
                    ...rest,
                };

                // Add the new node
                const updatedNodes = nodes.concat(newNode);

                // User requested FULL AUTO-LAYOUT on every insertion ("don't worry about user layout")
                // So we use getLayoutedElements instead of getSmartLayoutedElements
                const { nodes: layoutedNodes, edges: layoutedEdges } = await getLayoutedElements(
                    updatedNodes,
                    edges,
                    { direction: 'RIGHT' } // Ensure consistent direction
                );

                setNodes(layoutedNodes);
                setEdges(layoutedEdges);
                break;
            // Add other cases as needed
            default:
                console.warn('Unknown command type:', command.type);
        }
    }, [nodes, edges, setNodes, setEdges]);

    const onLayout = useCallback(async () => {
        const { nodes: layoutedNodes, edges: layoutedEdges } = await getLayoutedElements(
            nodes,
            edges,
            { 'elk.direction': 'RIGHT' }
        );

        setNodes([...layoutedNodes]);
        setEdges([...layoutedEdges]);
        
        // Sync all node positions to Loro to persist layout
        if (loroSync.connected) {
            layoutedNodes.forEach((node) => {
                loroSync.updateNode(node.id, {
                    position: node.position,
                    width: node.width,
                    height: node.height,
                });
            });
        }
    }, [nodes, edges, setNodes, setEdges, loroSync]);


    const findNodeIdByName = useCallback((name: string): string | undefined => {
        const node = nodes.find(n => n.data?.label === name);
        return node?.id;
    }, [nodes]);

    return (
        <ProjectProvider projectId={project.id}>
            <VideoEditorProvider>
                <MediaViewerProvider>
                    <LoroSyncProvider loroSync={loroSync}>
                        <div className="flex h-screen w-full flex-col bg-white overflow-hidden">
                        {/* Hidden File Input */}
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleFileChange}
                        />

                        {/* Top Toolbar */}


                        {/* Main Canvas Area */}
                        <div className="flex flex-1 overflow-hidden relative">
                            {/* Header Panel - Moved out of ReactFlow to prevent layout shifts */}
                            <div id="editor-header" className="absolute top-4 left-4 z-[60] pointer-events-none">
                                <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-slate-200/60 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-xl transition-all hover:shadow-md hover:bg-white/90">
                                    <Link href="/">
                                        <motion.button
                                            className="group flex h-8 items-center justify-center rounded-full bg-transparent text-slate-900 transition-colors"
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                        >
                                            <span className="font-display font-medium text-2xl tracking-tight">
                                                Clash
                                            </span>
                                        </motion.button>
                                    </Link>
                                    <span className="text-slate-300 text-xl font-light">/</span>
                                    <div className="grid items-center justify-items-start">
                                        {/* Invisible span to set width */}
                                        <span className="invisible col-start-1 row-start-1 text-sm font-bold px-1 whitespace-pre">
                                            {projectName || 'Untitled'}
                                        </span>
                                        <input
                                            className="col-start-1 row-start-1 w-full min-w-0 bg-transparent text-sm font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 -ml-1"
                                            size={1}
                                            value={projectName}
                                            onChange={(e) => setProjectName(e.target.value)}
                                            onBlur={() => {
                                                if (projectName !== project.name) {
                                                    updateProjectName(project.id, projectName);
                                                }
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.currentTarget.blur();
                                                }
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="absolute inset-0 z-0">
                                <ReactFlow
                                    nodes={nodes}
                                    edges={edges}
                                    onNodesChange={handleNodesChange}
                                    onEdgesChange={handleEdgesChange}
                                    onNodesDelete={onNodesDelete}
                                    onNodeDrag={onNodeDrag}
                                    onNodeDragStop={onNodeDragStop}
                                    onConnect={onConnect}
                                    onSelectionChange={onSelectionChange}

                                    nodeTypes={nodeTypes}
                                    fitView
                                    minZoom={0.1}
                                    proOptions={{ hideAttribution: true }}
                                >
                                    <Background
                                        variant={BackgroundVariant.Dots}
                                        gap={12}
                                        size={1.5}
                                        color="var(--canvas-dot)"
                                        style={{ backgroundColor: 'var(--canvas-bg)' }}
                                    />



                                    {/* Left Toolbar */}
                                    {/* Bottom Dock Tools */}
                                    <Panel
                                        position="bottom-center"
                                        className="m-4 mb-8 z-50 transition-all duration-300 ease-spring"
                                        style={{
                                            transform: `translate(calc(-50 % - ${!isSidebarCollapsed ? sidebarWidth / 2 : 0}px), 0)`
                                        }}
                                    >
                                        <div
                                            className="flex items-center gap-4 rounded-xl border border-slate-200/60 bg-white/80 p-3 shadow-lg backdrop-blur-xl transition-all hover:shadow-xl hover:bg-white/90 hover:-translate-y-1"
                                        >

                                            {/* Assets Section */}
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mr-1">Assets</span>
                                                {assetTools.map((tool) => {
                                                    const Icon = tool.icon;
                                                    return (
                                                        <motion.button
                                                            key={tool.id}
                                                            onClick={() => handleToolClick(tool.id)}
                                                            className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-900 border border-slate-200/50"
                                                            whileHover={{ scale: 1.1, y: -2 }}
                                                            whileTap={{ scale: 0.95 }}
                                                            title={tool.label}
                                                        >
                                                            <Icon className="h-5 w-5" weight="regular" />
                                                        </motion.button>
                                                    );
                                                })}
                                            </div>

                                            <div className="h-8 w-px bg-slate-200" />

                                            {/* Actions Section */}
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mr-1">Actions</span>
                                                {actionTools.map((tool) => {
                                                    const Icon = tool.icon;
                                                    return (
                                                        <motion.button
                                                            key={tool.id}
                                                            onClick={() => handleToolClick(tool.id)}
                                                            className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-700 transition-all hover:bg-slate-100 hover:text-slate-900 border border-slate-200/50"
                                                            whileHover={{ scale: 1.1, y: -2 }}
                                                            whileTap={{ scale: 0.95 }}
                                                            title={tool.label}
                                                        >
                                                            <Icon className="h-5 w-5" weight="regular" />
                                                        </motion.button>
                                                    );
                                                })}

                                                {/* Auto Layout Button */}
                                                <motion.button
                                                    onClick={onLayout}
                                                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-700 transition-all hover:bg-slate-100 hover:text-slate-900 border border-slate-200/50"
                                                    whileHover={{ scale: 1.1, y: -2 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    title="Auto Layout"
                                                >
                                                    <MagicWand className="h-5 w-5" weight="regular" />
                                                </motion.button>
                                            </div>

                                            <div className="h-8 w-px bg-slate-200" />

                                            {/* History Section */}
                                            <div className="flex items-center gap-1">
                                                <motion.button
                                                    onClick={() => loroSync.undo()}
                                                    disabled={!loroSync.canUndo}
                                                    className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all border border-slate-200/50 ${
                                                        loroSync.canUndo 
                                                        ? "bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-sm" 
                                                        : "bg-slate-50/50 text-slate-300 cursor-not-allowed"
                                                    }`}
                                                    whileHover={loroSync.canUndo ? { scale: 1.1, y: -2 } : {}}
                                                    whileTap={loroSync.canUndo ? { scale: 0.95 } : {}}
                                                    title="Undo (Cmd+Z)"
                                                >
                                                    <ArrowCounterClockwise className="h-5 w-5" weight="bold" />
                                                </motion.button>
                                                <motion.button
                                                    onClick={() => loroSync.redo()}
                                                    disabled={!loroSync.canRedo}
                                                    className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all border border-slate-200/50 ${
                                                        loroSync.canRedo 
                                                        ? "bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-sm" 
                                                        : "bg-slate-50/50 text-slate-300 cursor-not-allowed"
                                                    }`}
                                                    whileHover={loroSync.canRedo ? { scale: 1.1, y: -2 } : {}}
                                                    whileTap={loroSync.canRedo ? { scale: 0.95 } : {}}
                                                    title="Redo (Cmd+Shift+Z)"
                                                >
                                                    <ArrowClockwise className="h-5 w-5" weight="bold" />
                                                </motion.button>
                                            </div>

                                        </div>
                                    </Panel>
                                </ReactFlow>
                            </div>

                            <div id="copilot-container" className="fixed right-0 top-0 bottom-0 z-40 pointer-events-none">
                                <div className="pointer-events-auto h-full">
                                    <ChatbotCopilot
                                        projectId={project.id}
                                        initialMessages={project.messages}
                                        onCommand={handleCommand}
                                        width={sidebarWidth}
                                        onWidthChange={setSidebarWidth}
                                        isCollapsed={isSidebarCollapsed}
                                        onCollapseChange={setIsSidebarCollapsed}
                                        selectedNodes={selectedNodes}
                                        onAddNode={addNode}
                                        onAddEdge={onConnect}
                                        onUpdateNode={updateNode}
                                        findNodeIdByName={findNodeIdByName}
                                        nodes={nodes}
                                        edges={edges}
                                        initialPrompt={initialPrompt}
                                    />
                                </div>
                            </div>
                        </div>
                        </div>
                    </LoroSyncProvider>
                </MediaViewerProvider>
            </VideoEditorProvider>
        </ProjectProvider >
    );
}
