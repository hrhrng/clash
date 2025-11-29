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
} from 'reactflow';
import 'reactflow/dist/style.css';
import { motion } from 'framer-motion';
import {
    FilmSlate,
    TextT,
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
import AudioNode from './nodes/AudioNode';
import ActionBadge from './nodes/ActionBadge';
import GroupNode from './nodes/GroupNode';
import { MediaViewerProvider } from './MediaViewerContext';
import { ProjectProvider } from './ProjectContext';

interface ProjectEditorProps {
    project: Project & { messages: Message[] };
}

const nodeTypes = {
    video: VideoNode,
    image: ImageNode,
    'image-gen': ImageGenNode,
    text: TextNode,
    audio: AudioNode,
    'action-badge': ActionBadge,
    group: GroupNode,
};

export default function ProjectEditor({ project }: ProjectEditorProps) {
    // Initialize with data from DB, or defaults if empty
    const initialNodes = (project.nodes as unknown as Node[]) || [];
    const initialEdges = (project.edges as unknown as Edge[]) || [];

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [selectedTool, setSelectedTool] = useState<string | null>(null);
    const [projectName, setProjectName] = useState(project.name);



    // File upload state
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [pendingNodeType, setPendingNodeType] = useState<string | null>(null);

    // Sync local state when prop changes (e.g. after agent action revalidation)
    // Sync local state when prop changes (e.g. after agent action revalidation)
    useEffect(() => {
        if (project.nodes) {
            setNodes((project.nodes as unknown as Node[]) || []);
        }
        if (project.edges) {
            setEdges((project.edges as unknown as Edge[]) || []);
        }
    }, [project.nodes, project.edges, setNodes, setEdges]);

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
        { id: 'text', label: 'Text', icon: TextT },
        { id: 'image', label: 'Image', icon: ImageIcon },
        { id: 'video', label: 'Video', icon: FilmSlate },
        { id: 'audio', label: 'Audio', icon: SpeakerHigh },
        { id: 'group', label: 'Group', icon: Plus },
    ];

    const actionTools = [
        { id: 'action-badge-image', label: 'Gen Image', icon: MagicWand },
        { id: 'action-badge-video', label: 'Gen Video', icon: FilmSlate },
    ];

    const addNode = (type: string, extraData: any = {}) => {
        let nodeType = type;
        let nodeData: any = { label: `New ${type}`, ...extraData };

        if (type === 'action-badge-image') {
            nodeType = 'action-badge';
            nodeData = { ...nodeData, actionType: 'image-gen', modelName: 'Nano Banana' };
        } else if (type === 'action-badge-video') {
            nodeType = 'action-badge';
            nodeData = { ...nodeData, actionType: 'video-gen', modelName: 'Veo3' };
        } else if (type === 'text') {
            nodeData = { label: 'Text Node', ...nodeData, content: '# Hello World\nDouble click to edit.' };
        }

        // For group nodes, calculate z-index to be lower than existing groups (so it appears behind)
        let zIndex: number | undefined = undefined;
        if (nodeType === 'group') {
            const groupNodes = nodes.filter((n) => n.type === 'group');
            const minZIndex = groupNodes.reduce((min, n) => {
                const nodeZIndex = n.style?.zIndex ?? 0;
                return Math.min(min, nodeZIndex);
            }, 0);
            zIndex = minZIndex - 1;
        }

        const newNode: Node = {
            id: `${nodes.length + 1}-${Date.now()}`,
            type: nodeType,
            data: nodeData,
            position: {
                x: Math.random() * 500,
                y: Math.random() * 500,
            },
            style: nodeType === 'group' ? { width: 400, height: 400, zIndex } : undefined,
            className: nodeType === 'group' ? 'group-node' : '',
        };
        setNodes((nds) => nds.concat(newNode));
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
                const newNode: Node = {
                    id: `${nodes.length + 1}-${Date.now()}`,
                    ...command.payload,
                };
                setNodes((nds) => nds.concat(newNode));
                break;
            // Add other cases as needed
            default:
                console.warn('Unknown command type:', command.type);
        }
    }, [nodes.length, setNodes]);



    return (
        <ProjectProvider projectId={project.id}>
            <MediaViewerProvider>
                <div className="flex h-screen w-full flex-col bg-white">
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
                        <div className="flex-1 relative h-full">
                            <ReactFlow
                                nodes={nodes}
                                edges={edges}
                                onNodesChange={onNodesChange}
                                onEdgesChange={onEdgesChange}
                                onConnect={onConnect}
                                onNodeDragStop={(event, node) => {
                                    // Helper to recursively calculate absolute position of a node
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

                                    // Helper to check if groupId is a descendant of nodeId (prevent circular nesting)
                                    const isDescendant = (groupId: string, nodeId: string): boolean => {
                                        const group = nodes.find((n) => n.id === groupId);
                                        if (!group || !group.parentId) return false;
                                        if (group.parentId === nodeId) return true;
                                        return isDescendant(group.parentId, nodeId);
                                    };

                                    // Check intersection with group nodes (including nested groups)
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
                                            const groupZIndex = group.style?.zIndex ?? -1;
                                            if (groupZIndex > maxZIndex) {
                                                maxZIndex = groupZIndex;
                                                newParentId = group.id;
                                            }
                                        }
                                    }

                                    // Update node if parent changed
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

                                                            newNode.position = {
                                                                x: absoluteNodeRect.x - parentAbsPos.x,
                                                                y: absoluteNodeRect.y - parentAbsPos.y,
                                                            };

                                                            // For group nodes, ensure they remain editable and above parent
                                                            if (node.type === 'group') {
                                                                const parentZIndex = parent.style?.zIndex ?? 0;
                                                                newNode.draggable = true;
                                                                newNode.selectable = true;
                                                                newNode.style = {
                                                                    ...newNode.style,
                                                                    zIndex: parentZIndex + 1, // Child group should be above parent
                                                                };
                                                                // Don't set extent for group nodes - they need freedom to move
                                                                newNode.extent = undefined;
                                                            } else {
                                                                // For non-group nodes, optionally constrain to parent
                                                                // newNode.extent = 'parent';
                                                            }
                                                        }
                                                    } else {
                                                        // Becoming orphan, convert to absolute
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
                                {/* Header Panel */}
                                <Panel position="top-left" className="m-4 z-50">
                                    <div className="flex items-center gap-3 rounded-lg border border-slate-200/60 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-xl transition-all hover:shadow-md hover:bg-white/90">
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
                                </Panel>

                                {/* Left Toolbar */}
                                {/* Bottom Dock Tools */}
                                <Panel position="bottom-center" className="m-4 mb-8 z-50">
                                    <div className="flex items-center gap-4 rounded-xl border border-slate-200/60 bg-white/80 p-3 shadow-lg backdrop-blur-xl transition-all hover:shadow-xl hover:bg-white/90 hover:-translate-y-1">

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
                                                        className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-all hover:bg-blue-100 hover:text-blue-700 border border-blue-200/50"
                                                        whileHover={{ scale: 1.1, y: -2 }}
                                                        whileTap={{ scale: 0.95 }}
                                                        title={tool.label}
                                                    >
                                                        <Icon className="h-5 w-5" weight="fill" />
                                                    </motion.button>
                                                );
                                            })}
                                        </div>

                                    </div>
                                </Panel>
                            </ReactFlow>
                        </div>

                        <ChatbotCopilot
                            projectId={project.id}
                            initialMessages={project.messages}
                            onCommand={handleCommand}
                        />
                    </div>
                </div>
            </MediaViewerProvider>
        </ProjectProvider>
    );
}
