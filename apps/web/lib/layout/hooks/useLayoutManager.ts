import { useCallback, useMemo } from 'react';
import { useReactFlow, Node } from 'reactflow';
import type { Point, Size, Rect, OwnershipResult, LayoutManagerConfig, MeshConfig } from '../types';
import { Mesh, createMesh } from '../core/mesh';
import { getAbsoluteRect, getAbsolutePosition, getNodeSize } from '../core/geometry';
import { determineGroupOwnership, updateNodeOwnership, checkOwnershipChange } from '../group/ownership';
import { autoScaleGroups, recursiveGroupScale, applyGroupScales } from '../group/auto-scale';
import { resolveCollisions, applyResolution } from '../collision/resolver';
import { getSiblings } from '../group/hierarchy';

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
    const { getNodes, setNodes, getNode } = useReactFlow();

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
        setNodes((nodes) => updateNodeOwnership(nodes, nodeId, ownership));
    }, [setNodes]);

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
                return applyResolution(nodes, result);
            }
            return nodes;
        });
    }, [setNodes, mesh, finalConfig.maxChainReactionIterations]);

    /**
     * Scale groups for a node (after position/size change)
     */
    const scaleGroupsForNode = useCallback((nodeId: string) => {
        setNodes((nodes) => {
            const scales = recursiveGroupScale(nodeId, nodes);
            if (scales.size > 0) {
                console.log(`[LayoutManager] Scaled ${scales.size} group(s)`);
                return applyGroupScales(nodes, scales);
            }
            return nodes;
        });
    }, [setNodes]);

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
        const nodeSize = getNodeSize(newNode.type);

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

        // Calculate target position based on parent
        const parentAbsPos = getAbsolutePosition(parentNode, nodes);
        const targetPos = {
            x: parentAbsPos.x + offset.x,
            y: parentAbsPos.y + offset.y,
        };

        // Use parent's parent as the parentId for the new node
        const parentGroupId = parentNode.parentId;

        return addNodeWithLayout(newNode, targetPos, parentGroupId);
    }, [getNodes, addNodeWithLayout]);

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
        mesh,
    };
}
