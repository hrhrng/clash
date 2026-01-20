import { useCallback, useMemo } from 'react';
import { useReactFlow, Node, Edge } from 'reactflow';
import type { Point, Size, Rect, OwnershipResult, LayoutManagerConfig } from '../types';
import { Mesh, createMesh } from '../core/mesh';
import { getAbsoluteRect, getAbsolutePosition, getNodeSize } from '../core/geometry';
import { updateNodeOwnership, checkOwnershipChange } from '../group/ownership';
import { recursiveGroupScale, applyGroupScales } from '../group/auto-scale';
import { resolveCollisions, applyResolution } from '../collision/resolver';
import {
    needsAutoLayout,
    autoInsertNode,
    applyAutoInsertResult,
} from '../auto-insert';

/**
 * Maximum dimension for media nodes (matches VideoNode.MAX_MEDIA_DIMENSION)
 */
const MAX_MEDIA_DIMENSION = 500;

/**
 * Calculate scaled dimensions from natural width/height to fit within MAX_MEDIA_DIMENSION
 * Matches VideoNode.calculateScaledDimensions logic
 */
function calculateScaledDimensions(naturalWidth: number, naturalHeight: number): Size {
    if (!naturalWidth || !naturalHeight) {
        return { width: 400, height: 400 };
    }

    const scale = Math.min(1, MAX_MEDIA_DIMENSION / Math.max(naturalWidth, naturalHeight));
    return {
        width: Math.round(naturalWidth * scale),
        height: Math.round(naturalHeight * scale),
    };
}

/**
 * Calculate node dimensions from aspect ratio
 * Used to pre-size media nodes correctly on creation
 */
function calculateDimensionsFromAspectRatio(aspectRatio?: string): Size {
    if (!aspectRatio) {
        return { width: 400, height: 400 }; // Default square
    }

    const parts = aspectRatio.split(':');
    if (parts.length !== 2) {
        return { width: 400, height: 400 };
    }

    const widthRatio = parseFloat(parts[0]);
    const heightRatio = parseFloat(parts[1]);

    if (!widthRatio || !heightRatio) {
        return { width: 400, height: 400 };
    }

    // Calculate dimensions that fit within MAX_MEDIA_DIMENSION
    if (widthRatio >= heightRatio) {
        // Landscape or square
        const width = MAX_MEDIA_DIMENSION;
        const height = Math.round((heightRatio / widthRatio) * MAX_MEDIA_DIMENSION);
        return { width, height };
    } else {
        // Portrait
        const height = MAX_MEDIA_DIMENSION;
        const width = Math.round((widthRatio / heightRatio) * MAX_MEDIA_DIMENSION);
        return { width, height };
    }
}

/**
 * Get the appropriate size for a node with multiple fallback strategies
 *
 * Priority for media nodes:
 * 1. naturalWidth/naturalHeight (actual video/image dimensions)
 * 2. aspectRatio (calculated dimensions)
 * 3. Default size
 */
function getNodeSizeWithData(nodeType: string, nodeData?: any): Size {
    const defaultSize = getNodeSize(nodeType);

    // For media nodes, try multiple strategies to get correct dimensions
    if (nodeType === 'video' || nodeType === 'image') {
        // Strategy 1: Use actual natural dimensions if available (most accurate)
        if (nodeData?.naturalWidth && nodeData?.naturalHeight) {
            return calculateScaledDimensions(nodeData.naturalWidth, nodeData.naturalHeight);
        }

        // Strategy 2: Use aspect ratio if available
        if (nodeData?.aspectRatio) {
            return calculateDimensionsFromAspectRatio(nodeData.aspectRatio);
        }
    }

    return defaultSize;
}

const DEFAULT_CONFIG: LayoutManagerConfig = {
    mesh: {
        cellWidth: 50,
        cellHeight: 50,
        maxColumns: 10,
        padding: 20,
    },
    autoScale: true,
    autoResolveCollisions: true,
    maxChainReactionIterations: 10,
};

export interface UseLayoutManagerReturn {
    // Group ownership
    checkGroupOwnership: (nodeId: string) => { hasChanged: boolean; ownership: OwnershipResult };
    applyOwnershipChange: (nodeId: string, ownership: OwnershipResult) => void;

    // Collision resolution
    resolveCollisionsForNode: (nodeId: string) => void;

    // Auto-scale
    scaleGroupsForNode: (nodeId: string) => void;

    // Combined operations
    handleNodeDragEnd: (nodeId: string) => void;
    handleNodeResize: (nodeId: string) => void;

    // Mesh utilities
    snapToGrid: (position: Point) => Point;
    findNonOverlappingPosition: (
        targetPos: Point,
        nodeSize: Size,
        parentId?: string
    ) => Point;

    // Add node with auto layout
    addNodeWithLayout: (
        newNode: Partial<Node> & { type: string },
        targetPosition: Point,
        parentId?: string
    ) => Node;

    // Legacy API compatibility (used by ActionBadge)
    addNodeWithAutoLayout: (
        newNode: Partial<Node> & { type: string },
        parentNodeId: string,
        offset?: { x: number; y: number }
    ) => Node | null;

    // Auto-insert for nodes with special placeholder position (from backend or programmatic creation)
    // Returns IDs of nodes that were processed
    handleAutoInsertNodes: (edges: Edge[]) => string[];

    // Mesh instance
    mesh: Mesh;
}

/**
 * Unified hook for layout management
 * Replaces useAutoLayout with a cleaner, more modular API
 */
export function useLayoutManager(
    config: Partial<LayoutManagerConfig> = {}
): UseLayoutManagerReturn {
    const { getNodes, setNodes } = useReactFlow();

    const finalConfig = useMemo(() => ({
        ...DEFAULT_CONFIG,
        ...config,
        mesh: { ...DEFAULT_CONFIG.mesh, ...config.mesh },
    }), [config]);

    const mesh = useMemo(() => createMesh(finalConfig.mesh), [finalConfig.mesh]);

    /**
     * Check if a node's group ownership has changed
     */
    const checkGroupOwnership = useCallback((nodeId: string) => {
        const nodes = getNodes();
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) {
            return { hasChanged: false, ownership: { newParentId: undefined, relativePosition: { x: 0, y: 0 } } };
        }
        return checkOwnershipChange(node, nodes);
    }, [getNodes]);

    /**
     * Apply ownership change to a node
     */
    const applyOwnershipChange = useCallback((nodeId: string, ownership: OwnershipResult) => {
        setNodes((nodes) => {
            const nextNodes = updateNodeOwnership(nodes, nodeId, ownership);
            finalConfig.onNodesMutated?.(nodes, nextNodes);
            return nextNodes;
        });
    }, [setNodes, finalConfig]);

    /**
     * Resolve collisions for a specific node
     */
    const resolveCollisionsForNode = useCallback((nodeId: string) => {
        setNodes((nodes) => {
            const result = resolveCollisions(nodes, nodeId, mesh, {
                maxIterations: finalConfig.maxChainReactionIterations,
            });
            if (result.steps.length > 0) {
                console.log(`[LayoutManager] Resolved ${result.steps.length} collision(s) in ${result.iterations} iteration(s)`);
                const nextNodes = applyResolution(nodes, result);
                finalConfig.onNodesMutated?.(nodes, nextNodes);
                return nextNodes;
            }
            return nodes;
        });
    }, [setNodes, mesh, finalConfig]);

    /**
     * Scale groups for a node (after position/size change)
     */
    const scaleGroupsForNode = useCallback((nodeId: string) => {
        setNodes((nodes) => {
            const scales = recursiveGroupScale(nodeId, nodes);
            if (scales.size > 0) {
                console.log(`[LayoutManager] Scaled ${scales.size} group(s)`);
                const nextNodes = applyGroupScales(nodes, scales);
                finalConfig.onNodesMutated?.(nodes, nextNodes);
                return nextNodes;
            }
            return nodes;
        });
    }, [setNodes, finalConfig]);

    /**
     * Handle node drag end - check ownership and resolve collisions
     */
    const handleNodeDragEnd = useCallback((nodeId: string) => {
        const { hasChanged, ownership } = checkGroupOwnership(nodeId);

        setNodes((nodes) => {
            let updatedNodes = nodes;

            // 1. Apply ownership change if needed
            if (hasChanged) {
                console.log(`[LayoutManager] Node ${nodeId} ownership changed to ${ownership.newParentId || 'root'}`);
                updatedNodes = updateNodeOwnership(updatedNodes, nodeId, ownership);
            }

            // 2. Auto-scale parent groups
            if (finalConfig.autoScale) {
                const scales = recursiveGroupScale(nodeId, updatedNodes);
                if (scales.size > 0) {
                    updatedNodes = applyGroupScales(updatedNodes, scales);

                    // 3. Resolve collisions caused by scaling
                    if (finalConfig.autoResolveCollisions) {
                        for (const groupId of scales.keys()) {
                            const result = resolveCollisions(updatedNodes, groupId, mesh, {
                                maxIterations: finalConfig.maxChainReactionIterations,
                            });
                            if (result.steps.length > 0) {
                                updatedNodes = applyResolution(updatedNodes, result);
                            }
                        }
                    }
                }
            }

            if (updatedNodes !== nodes) {
                finalConfig.onNodesMutated?.(nodes, updatedNodes);
            }
            return updatedNodes;
        });
    }, [checkGroupOwnership, setNodes, mesh, finalConfig]);

    /**
     * Handle node resize - scale groups and resolve collisions
     */
    const handleNodeResize = useCallback((nodeId: string) => {
        setNodes((nodes) => {
            let updatedNodes = nodes;

            // 1. Auto-scale parent groups
            if (finalConfig.autoScale) {
                const scales = recursiveGroupScale(nodeId, updatedNodes);
                if (scales.size > 0) {
                    updatedNodes = applyGroupScales(updatedNodes, scales);
                }
            }

            // 2. Resolve collisions
            if (finalConfig.autoResolveCollisions) {
                const result = resolveCollisions(updatedNodes, nodeId, mesh, {
                    maxIterations: finalConfig.maxChainReactionIterations,
                });
                if (result.steps.length > 0) {
                    updatedNodes = applyResolution(updatedNodes, result);
                }
            }

            if (updatedNodes !== nodes) {
                finalConfig.onNodesMutated?.(nodes, updatedNodes);
            }
            return updatedNodes;
        });
    }, [setNodes, mesh, finalConfig]);

    /**
     * Snap position to grid
     */
    const snapToGrid = useCallback((position: Point): Point => {
        return mesh.snapToGrid(position);
    }, [mesh]);

    /**
     * Find non-overlapping position for a new node
     */
    const findNonOverlappingPosition = useCallback((
        targetPos: Point,
        nodeSize: Size,
        parentId?: string
    ): Point => {
        const nodes = getNodes();

        // Get siblings (nodes with same parent)
        const siblings = nodes.filter((n) => n.parentId === parentId && n.type !== 'group');

        // Build occupied rects
        const occupiedRects: Rect[] = siblings.map((s) => {
            const rect = getAbsoluteRect(s, nodes);
            return rect;
        });

        // If we have a parent, we need to work in absolute coordinates
        let absTargetPos = targetPos;
        if (parentId) {
            const parent = nodes.find((n) => n.id === parentId);
            if (parent) {
                const parentAbsPos = getAbsolutePosition(parent, nodes);
                absTargetPos = {
                    x: parentAbsPos.x + targetPos.x,
                    y: parentAbsPos.y + targetPos.y,
                };
            }
        }

        const newAbsPos = mesh.findNonOverlappingPosition(absTargetPos, nodeSize, occupiedRects);

        // Convert back to relative if has parent
        if (parentId) {
            const parent = nodes.find((n) => n.id === parentId);
            if (parent) {
                const parentAbsPos = getAbsolutePosition(parent, nodes);
                return {
                    x: newAbsPos.x - parentAbsPos.x,
                    y: newAbsPos.y - parentAbsPos.y,
                };
            }
        }

        return newAbsPos;
    }, [getNodes, mesh]);

    /**
     * Add a new node with automatic layout
     */
    const addNodeWithLayout = useCallback((
        newNode: Partial<Node> & { type: string },
        targetPosition: Point,
        parentId?: string
    ): Node => {
        // Get node size considering aspectRatio data
        const nodeSize = getNodeSizeWithData(newNode.type, newNode.data);

        // Find non-overlapping position
        const position = findNonOverlappingPosition(targetPosition, nodeSize, parentId);

        const completeNode: Node = {
            ...newNode,
            id: newNode.id || `node-${Date.now()}`,
            type: newNode.type,
            position,
            parentId,
            data: newNode.data || {},
            width: nodeSize.width,
            height: nodeSize.height,
        };

        setNodes((nodes) => {
            let updatedNodes = [...nodes, completeNode];

            // Auto-scale parent groups
            if (finalConfig.autoScale && parentId) {
                const scales = recursiveGroupScale(completeNode.id, updatedNodes);
                if (scales.size > 0) {
                    updatedNodes = applyGroupScales(updatedNodes, scales);

                    // Resolve collisions caused by scaling
                    if (finalConfig.autoResolveCollisions) {
                        for (const groupId of scales.keys()) {
                            const result = resolveCollisions(updatedNodes, groupId, mesh, {
                                maxIterations: finalConfig.maxChainReactionIterations,
                            });
                            if (result.steps.length > 0) {
                                updatedNodes = applyResolution(updatedNodes, result);
                            }
                        }
                    }
                }
            }

            finalConfig.onNodesMutated?.(nodes, updatedNodes);
            return updatedNodes;
        });

        return completeNode;
    }, [findNonOverlappingPosition, setNodes, mesh, finalConfig]);

    /**
     * Legacy API compatibility for ActionBadge
     * Takes parentNodeId and calculates target position based on it
     */
    const addNodeWithAutoLayout = useCallback((
        newNode: Partial<Node> & { type: string },
        parentNodeId: string,
        offset: { x: number; y: number } = { x: 300, y: 0 }
    ): Node | null => {
        const nodes = getNodes();
        const parentNode = nodes.find(n => n.id === parentNodeId);
        if (!parentNode) {
            console.error('[useLayoutManager] Parent node not found:', parentNodeId);
            return null;
        }

        // Use parent's parent as the parentId for the new node (same group as the parent node).
        const parentGroupId = parentNode.parentId;

        // Calculate target position next to the parent node, in the coordinate system
        // expected by addNodeWithLayout:
        // - root: absolute
        // - inside a group: relative to that group
        const parentAbsPos = getAbsolutePosition(parentNode, nodes);
        const absTargetPos = {
            x: parentAbsPos.x + offset.x,
            y: parentAbsPos.y + offset.y,
        };

        if (parentGroupId) {
            const parentGroup = nodes.find((n) => n.id === parentGroupId);
            if (parentGroup) {
                const groupAbsPos = getAbsolutePosition(parentGroup, nodes);
                const relTargetPos = {
                    x: absTargetPos.x - groupAbsPos.x,
                    y: absTargetPos.y - groupAbsPos.y,
                };
                return addNodeWithLayout(newNode, relTargetPos, parentGroupId);
            }
        }

        return addNodeWithLayout(newNode, absTargetPos, undefined);
    }, [getNodes, addNodeWithLayout]);

    /**
     * Handle auto-insert for nodes with special placeholder position
     * This is called when nodes are added from backend (Python) or programmatically
     * with position = { x: -1, y: -1 }
     *
     * Rules:
     * - Has reference (source node in same group via edge) → insert to the right
     * - No reference → place at bottom of group/canvas
     * - Chain-push overlapping nodes to the right
     */
    const handleAutoInsertNodes = useCallback((edges: Edge[]): string[] => {
        const processed: string[] = [];

        setNodes((nodes) => {
            // Find nodes that need auto-layout
            const nodesToLayout = nodes.filter(needsAutoLayout);

            if (nodesToLayout.length === 0) {
                return nodes;
            }

            console.log(`[LayoutManager] Auto-inserting ${nodesToLayout.length} node(s)`);

            let updatedNodes = [...nodes];

            for (const node of nodesToLayout) {
                // Calculate position and push overlapping nodes
                const result = autoInsertNode(node.id, updatedNodes, edges);

                console.log(
                    `[LayoutManager] Auto-inserted ${node.id}: ` +
                    `position=(${result.position.x}, ${result.position.y}), ` +
                    `hasReference=${result.hasReference}, ` +
                    `pushed=${result.pushedNodes.size} node(s)`
                );

                // Apply the result
                updatedNodes = applyAutoInsertResult(updatedNodes, node.id, result);
                processed.push(node.id);

                // Auto-scale parent groups if the node is in a group
                if (finalConfig.autoScale && node.parentId) {
                    const scales = recursiveGroupScale(node.id, updatedNodes);
                    if (scales.size > 0) {
                        console.log(`[LayoutManager] Scaled ${scales.size} group(s) for ${node.id}`);
                        updatedNodes = applyGroupScales(updatedNodes, scales);

                        // Resolve collisions caused by group scaling
                        if (finalConfig.autoResolveCollisions) {
                            for (const groupId of scales.keys()) {
                                const collisionResult = resolveCollisions(updatedNodes, groupId, mesh, {
                                    maxIterations: finalConfig.maxChainReactionIterations,
                                });
                                if (collisionResult.steps.length > 0) {
                                    updatedNodes = applyResolution(updatedNodes, collisionResult);
                                }
                            }
                        }
                    }
                }
            }

            if (updatedNodes !== nodes) {
                finalConfig.onNodesMutated?.(nodes, updatedNodes);
            }

            return updatedNodes;
        });

        return processed;
    }, [setNodes, mesh, finalConfig]);

    return {
        checkGroupOwnership,
        applyOwnershipChange,
        resolveCollisionsForNode,
        scaleGroupsForNode,
        handleNodeDragEnd,
        handleNodeResize,
        snapToGrid,
        findNonOverlappingPosition,
        addNodeWithLayout,
        addNodeWithAutoLayout,
        handleAutoInsertNodes,
        mesh,
    };
}
