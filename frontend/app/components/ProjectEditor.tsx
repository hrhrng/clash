'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
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
} from '@phosphor-icons/react';
import Link from 'next/link';
import { Project, Message } from '@generated/client';
import ChatbotCopilot from './ChatbotCopilot';
import { saveProjectState, updateProjectName } from '../actions';
import VideoNode from './nodes/VideoNode';
import ImageNode from './nodes/ImageNode';
import ImageGenNode from './nodes/ImageGenNode';
import TextNode from './nodes/TextNode';
import PromptNode from './nodes/PromptNode';
import ContextNode from './nodes/ContextNode';
import AudioNode from './nodes/AudioNode';
import ActionBadge from './nodes/ActionBadge';
import GroupNode from './nodes/GroupNode';
import VideoEditorNode from './nodes/VideoEditorNode';
import { MediaViewerProvider } from './MediaViewerContext';
import { ProjectProvider } from './ProjectContext';
import { VideoEditorProvider } from './VideoEditorContext';
import { findNonOverlappingPosition } from '../utils/layout';
import { getLayoutedElements } from '../utils/elkLayout';

interface ProjectEditorProps {
    project: Project & { messages: Message[] };
}

const nodeTypes = {
    video: VideoNode,
    image: ImageNode,
    'image-gen': ImageGenNode,
    text: TextNode,
    prompt: PromptNode,
    context: ContextNode,
    audio: AudioNode,
    'action-badge': ActionBadge,
    group: GroupNode,
    'video-editor': VideoEditorNode,
};

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

export default function ProjectEditor({ project }: ProjectEditorProps) {
    // Initialize with data from DB, or defaults if empty
    // Sanitize initial nodes to prevent crashes if DB has bad data
    const rawInitialNodes = (project.nodes as unknown as Node[]) || [];
    const initialNodes = sanitizeNodes(rawInitialNodes);
    const initialEdges = (project.edges as unknown as Edge[]) || [];

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [selectedTool, setSelectedTool] = useState<string | null>(null);
    const [projectName, setProjectName] = useState(project.name);



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

        // Check for dimension changes (resizing)
        const resizeChanges = changes.filter(c => c.type === 'dimensions');
        if (resizeChanges.length > 0) {
            setNodes((currentNodes) => {
                let updatedNodes = [...currentNodes];
                let hasUpdates = false;

                resizeChanges.forEach(change => {
                    if (change.type === 'dimensions' && change.dimensions) {
                        const node = updatedNodes.find(n => n.id === change.id);
                        if (node && node.parentId) {
                            // Update the node's dimensions in our temp list so the recursive logic sees the new size
                            // Note: onNodesChange (called above) queues the state update, but 'currentNodes' here 
                            // might be the *previous* state if React hasn't flushed yet. 
                            // However, since we are inside setNodes callback, 'currentNodes' is the latest state *before* this update.
                            // But onNodesChange also calls setNodes. This is tricky.
                            // Actually, 'change.dimensions' has the NEW dimensions.

                            // Let's manually update the node in our temp list to match the change
                            const nodeIndex = updatedNodes.findIndex(n => n.id === change.id);
                            if (nodeIndex !== -1) {
                                updatedNodes[nodeIndex] = {
                                    ...updatedNodes[nodeIndex],
                                    width: change.dimensions.width,
                                    height: change.dimensions.height,
                                    // ReactFlow might also update style.width/height, but dimensions is the source of truth for layout
                                };
                            }

                            // Now run recursive resize
                            const resizeParentRecursive = (nodesList: Node[], childNode: Node): Node[] => {
                                const pId = childNode.parentId;
                                if (!pId) return nodesList;

                                const parentIndex = nodesList.findIndex(n => n.id === pId);
                                if (parentIndex === -1) return nodesList;

                                const parent = nodesList[parentIndex];
                                const children = nodesList.filter(n => n.parentId === pId);

                                let maxRight = 0;
                                let maxBottom = 0;
                                const padding = 60;

                                children.forEach(child => {
                                    // For the node that changed, use its new dimensions (already in nodesList or childNode)
                                    // For others, use their current dimensions
                                    const w = child.width ?? Number(child.style?.width) ?? 0;
                                    const h = child.height ?? Number(child.style?.height) ?? 0;
                                    const x = child.position.x;
                                    const y = child.position.y;

                                    const right = x + w;
                                    const bottom = y + h;

                                    if (right > maxRight) maxRight = right;
                                    if (bottom > maxBottom) maxBottom = bottom;
                                });

                                const requiredWidth = maxRight + padding;
                                const requiredHeight = maxBottom + padding;

                                const currentWidth = parent.width || Number(parent.style?.width) || 400;
                                const currentHeight = parent.height || Number(parent.style?.height) || 400;

                                if (requiredWidth > currentWidth || requiredHeight > currentHeight) {
                                    const newWidth = Math.max(currentWidth, requiredWidth);
                                    const newHeight = Math.max(currentHeight, requiredHeight);

                                    const newParent = {
                                        ...parent,
                                        width: newWidth,
                                        height: newHeight,
                                        style: {
                                            ...parent.style,
                                            width: newWidth,
                                            height: newHeight,
                                        }
                                    };

                                    const newNodesList = [...nodesList];
                                    newNodesList[parentIndex] = newParent;
                                    hasUpdates = true;

                                    return resizeParentRecursive(newNodesList, newParent);
                                }

                                return nodesList;
                            };

                            updatedNodes = resizeParentRecursive(updatedNodes, updatedNodes[nodeIndex]);
                        }
                    }
                });

                return hasUpdates ? updatedNodes : currentNodes;
            });
        }
    }, [onNodesChange, setNodes]);

    const onSelectionChange = useCallback(({ nodes }: { nodes: Node[] }) => {
        setSelectedNodes(nodes);
    }, []);

    // Sync local state when prop changes (e.g. after agent action revalidation)
    // Sync local state when prop changes (e.g. after agent action revalidation)
    // Sync local state when prop changes (e.g. after agent action revalidation)
    // Sync local state when prop changes (e.g. after agent action revalidation)
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
                                src: sourceNode.data.src,
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

    // Auto-save on change (debounced in a real app, but simple here)
    useEffect(() => {
        const timer = setTimeout(() => {
            // Sanitize nodes and edges to remove non-serializable properties (like 'internals' symbol in React Flow nodes)
            // that cause "Only plain objects can be passed to Server Functions" error.
            const sanitizedNodes = nodes.map(node => {
                // Destructure to pick only serializable properties we want to persist
                const {
                    id, type, position, data, style, className,
                    width, height, parentId, extent
                } = node;
                return {
                    id, type, position, data, style, className,
                    width, height, parentId, extent
                };
            });

            const sanitizedEdges = edges.map(edge => {
                const {
                    id, source, target, sourceHandle, targetHandle,
                    type, animated, style, data, className
                } = edge;
                return {
                    id, source, target, sourceHandle, targetHandle,
                    type, animated, style, data, className
                };
            });

            saveProjectState(project.id, sanitizedNodes, sanitizedEdges);
        }, 1000);
        return () => clearTimeout(timer);
    }, [nodes, edges, project.id]);


    const onConnect = useCallback(
        (params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)),
        [setEdges]
    );

    const assetTools = [
        { id: 'prompt', label: 'Prompt', icon: ChatText },
        { id: 'context', label: 'Context', icon: Article },
        { id: 'image', label: 'Image', icon: ImageIcon },
        { id: 'video', label: 'Video', icon: FilmSlate },
        { id: 'audio', label: 'Audio', icon: SpeakerHigh },
        { id: 'video-editor', label: 'Editor', icon: FilmSlate },
        { id: 'group', label: 'Group', icon: Plus },
    ];

    const actionTools = [
        { id: 'action-badge-image', label: 'Gen Image', icon: ImageIcon },
        { id: 'action-badge-video', label: 'Gen Video', icon: FilmSlate },
    ];

    const addNode = (type: string, extraData: any = {}) => {
        let nodeType = type;
        let nodeData: any = { label: `New ${type}`, ...extraData };

        if (type === 'action-badge-image' || type === 'image-gen') {
            nodeType = 'action-badge';
            nodeData = { actionType: 'image-gen', modelName: 'Nano Banana', ...nodeData };
        } else if (type === 'action-badge-video' || type === 'video-gen') {
            nodeType = 'action-badge';
            nodeData = { actionType: 'video-gen', modelName: 'Veo3', ...nodeData };
        } else if (type === 'text') {
            nodeData = { label: 'Text Node', content: '# Hello World\nDouble click to edit.', ...nodeData };
        } else if (type === 'prompt') {
            nodeData = { label: 'Prompt', content: '# Prompt\nEnter your prompt here...', ...nodeData };
        } else if (type === 'context') {
            nodeData = { label: 'Context', content: '# Context\nAdd background information here...', ...nodeData };
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
                console.log(`[addNode] Creating nested group. Parent zIndex: ${parentZIndex}, New zIndex: ${zIndex}`);
            } else {
                // Root Group: Keep existing logic (behind other groups)
                const groupNodes = nodes.filter((n) => n.type === 'group');
                const minZIndex = groupNodes.reduce((min, n) => {
                    const nodeZIndex = Number(n.style?.zIndex ?? 0);
                    return Math.min(min, nodeZIndex);
                }, 0);
                zIndex = minZIndex - 1;
                console.log(`[addNode] Creating root group. New zIndex: ${zIndex}`);
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
                defaultWidth = 200;
                defaultHeight = 60;
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
                console.log(`[addNode] Validating parentId: ${parentId}. Found: ${!!parentExists}`);
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

            console.log('[addNode] Calculating position for', nodeType, 'parentId:', parentId, 'upstream:', extraData.upstreamNodeId, 'layout:', extraData.layoutDirection);

            if (parentId) {
                // Start at top-left of group
                targetPos = { x: 50, y: 50 };

                // 1. Upstream Node Placement (Highest Priority)
                if (extraData.upstreamNodeId) {
                    const upstreamNode = nds.find(n => n.id === extraData.upstreamNodeId);
                    if (upstreamNode && upstreamNode.parentId === parentId) {
                        const upstreamWidth = upstreamNode.width || Number(upstreamNode.style?.width) || 300;
                        const upstreamHeight = upstreamNode.height || Number(upstreamNode.style?.height) || 300;

                        // Center vertically relative to upstream node
                        const centerY = upstreamNode.position.y + (upstreamHeight / 2);
                        const newNodeY = centerY - (defaultHeight / 2);

                        targetPos = {
                            x: upstreamNode.position.x + upstreamWidth + 80, // Increased spacing slightly
                            y: newNodeY
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

            console.log('[addNode] Initial targetPos:', targetPos);

            const position = findNonOverlappingPosition(
                targetPos,
                defaultWidth,
                defaultHeight,
                nds,
                nds,
                parentId
            );
            console.log('[addNode] Final position:', position);

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

            // 3. Update nodes with Recursive Group Resizing
            let updatedNodes = [...nds, newNode];

            const resizeParentRecursive = (currentNodes: Node[], childNode: Node): Node[] => {
                const pId = childNode.parentId;
                if (!pId) return currentNodes;

                const parentIndex = currentNodes.findIndex(n => n.id === pId);
                if (parentIndex === -1) return currentNodes;

                const parent = currentNodes[parentIndex];

                // Calculate bounding box of ALL children (including the new/updated child)
                const children = currentNodes.filter(n => n.parentId === pId);

                let maxRight = 0;
                let maxBottom = 0;
                const padding = 60;

                children.forEach(child => {
                    const w = child.width || Number(child.style?.width) || 300;
                    const h = child.height || Number(child.style?.height) || 300;
                    const right = child.position.x + w;
                    const bottom = child.position.y + h;
                    if (right > maxRight) maxRight = right;
                    if (bottom > maxBottom) maxBottom = bottom;
                });

                const requiredWidth = maxRight + padding;
                const requiredHeight = maxBottom + padding;

                const currentWidth = parent.width || Number(parent.style?.width) || 400;
                const currentHeight = parent.height || Number(parent.style?.height) || 400;

                if (requiredWidth > currentWidth || requiredHeight > currentHeight) {
                    const newWidth = Math.max(currentWidth, requiredWidth);
                    const newHeight = Math.max(currentHeight, requiredHeight);

                    console.log('[addNode] Resizing group', parent.id, 'from', currentWidth, 'x', currentHeight, 'to', newWidth, 'x', newHeight);

                    const newParent = {
                        ...parent,
                        width: newWidth,
                        height: newHeight,
                        style: {
                            ...parent.style,
                            width: newWidth,
                            height: newHeight,
                        }
                    };

                    const newNodesList = [...currentNodes];
                    newNodesList[parentIndex] = newParent;

                    // Recurse up
                    return resizeParentRecursive(newNodesList, newParent);
                }

                return currentNodes;
            };

            return resizeParentRecursive(updatedNodes, newNode);
        });
        return newNodeId;
    };

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

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && pendingNodeType) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const src = e.target?.result as string;
                addNode(pendingNodeType, { src, label: file.name });
                setPendingNodeType(null);
            };
            reader.onerror = () => {
                console.error('Failed to read file');
                setPendingNodeType(null);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleCommand = useCallback((command: any) => {
        console.log('Executing command:', command);
        switch (command.type) {
            case 'ADD_NODE':
                let { type, data, ...rest } = command.payload;

                // Map legacy/agent types to action-badge
                if (type === 'image-gen') {
                    type = 'action-badge';
                    data = { actionType: 'image-gen', modelName: 'Gemini 1.5 Flash', ...data };
                    if (!rest.width) rest.width = 200;
                    if (!rest.height) rest.height = 60;
                } else if (type === 'video-gen') {
                    type = 'action-badge';
                    data = { actionType: 'video-gen', modelName: 'Veo3', ...data };
                    if (!rest.width) rest.width = 200;
                    if (!rest.height) rest.height = 60;
                }

                // Validate parentId if present
                if (rest.parentId && !nodes.find(n => n.id === rest.parentId)) {
                    console.warn(`Parent node ${rest.parentId} not found in command, creating node at root level`);
                    delete rest.parentId;
                }

                const newNode: Node = {
                    id: `${nodes.length + 1}-${Date.now()}`,
                    type,
                    data,
                    ...rest,
                };
                setNodes((nds) => nds.concat(newNode));
                break;
            // Add other cases as needed
            default:
                console.warn('Unknown command type:', command.type);
        }
    }, [nodes.length, setNodes]);

    const onLayout = useCallback(async () => {
        const { nodes: layoutedNodes, edges: layoutedEdges } = await getLayoutedElements(
            nodes,
            edges,
            { 'elk.direction': 'RIGHT' }
        );

        setNodes([...layoutedNodes]);
        setEdges([...layoutedEdges]);
    }, [nodes, edges, setNodes, setEdges]);


    const findNodeIdByName = useCallback((name: string): string | undefined => {
        const node = nodes.find(n => n.data?.label === name);
        return node?.id;
    }, [nodes]);

    return (
        <ProjectProvider projectId={project.id}>
            <VideoEditorProvider>
                <MediaViewerProvider>
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
                                    onEdgesChange={onEdgesChange}
                                    onConnect={onConnect}
                                    onSelectionChange={onSelectionChange}
                                    onNodeDragStop={(event, node) => {
                                        // LOGIC EXPLANATION:
                                        // When a node is dragged, we need to check if it has been dropped inside a group
                                        // or dragged out of its current parent.

                                        // 1. Helper to recursively calculate absolute position of a node.
                                        // This is necessary because node.position is relative to its parent.
                                        // To check for intersections, we need everything in the same global coordinate system.
                                        const getAbsolutePosition = (n: Node): { x: number; y: number } => {
                                            if (!n.parentId) {
                                                return { x: n.position.x, y: n.position.y };
                                            }
                                            const parent = nodes.find((p) => p.id === n.parentId);
                                            if (!parent) {
                                                return { x: n.position.x, y: n.position.y };
                                            }
                                            const parentAbsPos = getAbsolutePosition(parent);
                                            return {
                                                x: parentAbsPos.x + n.position.x,
                                                y: parentAbsPos.y + n.position.y,
                                            };
                                        };

                                        // 2. Helper to check if groupId is a descendant of nodeId.
                                        // We must prevent circular nesting (e.g., putting Group A inside Group B, when Group B is inside Group A).
                                        const isDescendant = (groupId: string, nodeId: string): boolean => {
                                            const group = nodes.find((n) => n.id === groupId);
                                            if (!group || !group.parentId) return false;
                                            if (group.parentId === nodeId) return true;
                                            return isDescendant(group.parentId, nodeId);
                                        };

                                        // 3. Check intersection with all other group nodes.
                                        const groupNodes = nodes.filter((n) => n.type === 'group' && n.id !== node.id);
                                        const nodeRect = {
                                            x: node.position.x,
                                            y: node.position.y,
                                            width: node.width || (node.type === 'group' ? 400 : 300),
                                            height: node.height || (node.type === 'group' ? 400 : 400),
                                        };

                                        // Calculate absolute position for the dragged node
                                        const absoluteNodePos = getAbsolutePosition(node);
                                        const absoluteNodeRect = {
                                            x: absoluteNodePos.x,
                                            y: absoluteNodePos.y,
                                            width: nodeRect.width,
                                            height: nodeRect.height,
                                        };

                                        let newParentId: string | undefined = undefined;
                                        let maxZIndex = -Infinity;

                                        for (const group of groupNodes) {
                                            // Skip if this group is a descendant of the node (prevent circular nesting)
                                            if (isDescendant(group.id, node.id)) continue;

                                            const groupRect = {
                                                x: group.position.x,
                                                y: group.position.y,
                                                width: group.style?.width || 400,
                                                height: group.style?.height || 400,
                                            };

                                            // Calculate absolute position of group
                                            const absoluteGroupPos = getAbsolutePosition(group);
                                            const absoluteGroupRect = {
                                                x: absoluteGroupPos.x,
                                                y: absoluteGroupPos.y,
                                                width: groupRect.width,
                                                height: groupRect.height,
                                            };

                                            // Check if node center is inside the group
                                            const nodeCenterX = absoluteNodeRect.x + nodeRect.width / 2;
                                            const nodeCenterY = absoluteNodeRect.y + nodeRect.height / 2;

                                            if (
                                                nodeCenterX > absoluteGroupRect.x &&
                                                nodeCenterX < absoluteGroupRect.x + (absoluteGroupRect.width as number) &&
                                                nodeCenterY > absoluteGroupRect.y &&
                                                nodeCenterY < absoluteGroupRect.y + (absoluteGroupRect.height as number)
                                            ) {
                                                // Pick the group with highest z-index (innermost/topmost group)
                                                // This ensures that if groups are overlapping, we drop into the "top" one.
                                                const groupZIndex = Number(group.style?.zIndex ?? -1);
                                                if (groupZIndex > maxZIndex) {
                                                    maxZIndex = groupZIndex;
                                                    newParentId = group.id;
                                                }
                                            }
                                        }

                                        // 4. Update node if parent changed
                                        if (newParentId !== node.parentId) {
                                            setNodes((nds) =>
                                                nds.map((n) => {
                                                    if (n.id === node.id) {
                                                        const newNode = { ...n, parentId: newParentId };

                                                        // Adjust position to be relative to new parent (or absolute if no parent)
                                                        if (newParentId) {
                                                            const parent = nodes.find((p) => p.id === newParentId);
                                                            if (parent) {
                                                                // Calculate parent's absolute position
                                                                const parentAbsPos = getAbsolutePosition(parent);

                                                                // Convert absolute coordinates back to relative coordinates for the new parent
                                                                newNode.position = {
                                                                    x: absoluteNodeRect.x - parentAbsPos.x,
                                                                    y: absoluteNodeRect.y - parentAbsPos.y,
                                                                };

                                                                // For group nodes, ensure they remain editable and above parent
                                                                if (node.type === 'group') {
                                                                    const parentZIndex = Number(parent.style?.zIndex ?? 0);
                                                                    newNode.draggable = true;
                                                                    newNode.selectable = true;
                                                                    newNode.style = {
                                                                        ...newNode.style,
                                                                        zIndex: parentZIndex + 1, // Child group should be above parent
                                                                    };
                                                                    newNode.extent = undefined;
                                                                } else {
                                                                    // For non-group nodes, we also leave extent undefined to allow dragging out later
                                                                    newNode.extent = undefined;
                                                                }
                                                            }
                                                        } else {
                                                            // Becoming orphan (detached from group), convert to absolute coordinates
                                                            newNode.position = {
                                                                x: absoluteNodeRect.x,
                                                                y: absoluteNodeRect.y,
                                                            };
                                                            newNode.extent = undefined;
                                                        }
                                                        return newNode;
                                                    }
                                                    return n;
                                                })
                                            );
                                        }
                                    }}

                                    nodeTypes={nodeTypes}
                                    fitView
                                    minZoom={0.1}
                                    proOptions={{ hideAttribution: true }}
                                >
                                    <Background
                                        variant={BackgroundVariant.Dots}
                                        gap={12}
                                        size={1}
                                        color="#e2e8f0"
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
                                        findNodeIdByName={findNodeIdByName}
                                        nodes={nodes}
                                        edges={edges}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </MediaViewerProvider>
            </VideoEditorProvider>
        </ProjectProvider >
    );
}
