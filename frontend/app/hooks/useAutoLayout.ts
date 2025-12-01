import { useCallback } from 'react';
import { useReactFlow, Node, Rect } from 'reactflow';
import {
    autoPlaceNode,
    expandGroupToFit,
    resolveGroupOverlaps,
    getNodeSize,
    getAbsolutePosition,
    findNonOverlappingPosition,
} from '../utils/layout';

/**
 * Hook for automatic layout management
 * Leverages React Flow's native APIs for collision detection
 */
export function useAutoLayout() {
    const { getNodes, setNodes, getNode, getIntersectingNodes } = useReactFlow();

    /**
     * Helper to apply group expansion and overlap resolution to a list of nodes
     * Returns the updated list of nodes
     */
    const applyGroupExpansion = useCallback((nodes: Node[], groupId: string, newNode: Node): Node[] => {
        const parentGroup = nodes.find((n) => n.id === groupId);
        if (!parentGroup || parentGroup.type !== 'group') return nodes;

        // Calculate absolute position of new node
        const nodeSize = getNodeSize(newNode.type || 'default');
        const groupAbsPos = getAbsolutePosition(parentGroup, nodes);

        const newNodeAbsRect = {
            x: groupAbsPos.x + newNode.position.x,
            y: groupAbsPos.y + newNode.position.y,
            width: newNode.width || (newNode.style?.width as number) || nodeSize.width,
            height: newNode.height || (newNode.style?.height as number) || nodeSize.height,
        };

        const newSize = expandGroupToFit(parentGroup, newNodeAbsRect, nodes);
        const currentSize = {
            width: (parentGroup.style?.width as number) || 400,
            height: (parentGroup.style?.height as number) || 400,
        };

        // Only update if size changed
        if (newSize.width > currentSize.width || newSize.height > currentSize.height) {
            // Update group size
            let updatedNodes = nodes.map((n) => {
                if (n.id === groupId) {
                    return {
                        ...n,
                        style: { ...n.style, width: newSize.width, height: newSize.height },
                        width: newSize.width,
                        height: newSize.height,
                    };
                }
                return n;
            });

            // Check for overlaps and resolve
            const overlaps = resolveGroupOverlaps(groupId, updatedNodes);

            if (overlaps.size > 0) {
                updatedNodes = updatedNodes.map(n => {
                    const update = overlaps.get(n.id);
                    if (update) {
                        return {
                            ...n,
                            position: update.position || n.position,
                            style: {
                                ...n.style,
                                ...(update.size ? { width: update.size.width, height: update.size.height } : {})
                            },
                            ...(update.size ? { width: update.size.width, height: update.size.height } : {})
                        };
                    }
                    return n;
                });
            }

            return updatedNodes;
        }

        return nodes;
    }, []);

    /**
     * Add a node with automatic placement and group expansion
     * Uses React Flow's getIntersectingNodes for collision detection
     */
    const addNodeWithAutoLayout = useCallback(
        (
            newNode: Partial<Node> & { type: string },
            parentNodeId: string,
            offset: { x: number; y: number } = { x: 300, y: 0 }
        ): Node | null => {
            const parentNode = getNode(parentNodeId);
            if (!parentNode) {
                return null;
            }

            const allNodes = getNodes();
            const nodeSize = getNodeSize(newNode.type);
            const parentAbsPos = getAbsolutePosition(parentNode, allNodes);
            const parentGroupId = parentNode.parentId;

            // Default target position
            const targetPos = {
                x: parentAbsPos.x + offset.x,
                y: parentAbsPos.y + offset.y,
            };

            // Create collision checker using React Flow's API
            const checkOverlap = (testNode: { position: { x: number; y: number }; width: number; height: number }) => {
                // Create a temporary test node
                const tempNode: Node = {
                    id: 'temp-collision-test',
                    type: newNode.type,
                    position: testNode.position,
                    parentId: parentGroupId,
                    data: {},
                    width: testNode.width,
                    height: testNode.height,
                };

                // Use React Flow's getIntersectingNodes
                const intersecting = getIntersectingNodes(tempNode);
                // Filter out group nodes for collision detection
                return intersecting.filter(n => n.type !== 'group').length > 0;
            };

            // Find non-overlapping position using React Flow's collision detection
            const finalPos = findNonOverlappingPosition(
                targetPos,
                nodeSize.width,
                nodeSize.height,
                allNodes,
                allNodes,
                parentGroupId,
                checkOverlap
            );

            // Convert to relative position if in a group
            let relativePos = finalPos;
            if (parentGroupId) {
                const parentGroup = allNodes.find(n => n.id === parentGroupId);
                if (parentGroup) {
                    const groupAbsPos = getAbsolutePosition(parentGroup, allNodes);
                    relativePos = {
                        x: finalPos.x - groupAbsPos.x,
                        y: finalPos.y - groupAbsPos.y,
                    };
                }
            }

            // Create the complete node object
            const completeNode: Node = {
                id: newNode.id || `node-${Date.now()}`,
                position: relativePos,
                parentId: parentGroupId,
                data: newNode.data || {},
                width: nodeSize.width,
                height: nodeSize.height,
                ...newNode,
            };

            // Atomic update: Add node AND expand group in one transaction
            setNodes((currentNodes) => {
                const nodesWithNew = [...currentNodes, completeNode];

                if (parentGroupId) {
                    const expanded = applyGroupExpansion(nodesWithNew, parentGroupId, completeNode);
                    return expanded;
                }

                return nodesWithNew;
            });

            return completeNode;
        },
        [getNode, getNodes, setNodes, getIntersectingNodes, applyGroupExpansion]
    );

    /**
     * Expand a group to fit a node and resolve overlaps
     */
    const expandGroupForNode = useCallback(
        (groupId: string, newNode: Node, currentNodes?: Node[]) => {
            setNodes((nodes) => {
                // If currentNodes is provided, we might be working with stale state if we're not careful,
                // but usually this is called with fresh state. 
                // However, to be safe and atomic, we should always use the 'nodes' from the setter callback
                // as the base truth, unless we are sure 'currentNodes' is what we want to transform.
                // The original implementation used 'allNodes = currentNodes || getNodes()', which is risky inside setNodes.

                // We'll use the nodes passed to this updater function to ensure atomicity.
                return applyGroupExpansion(nodes, groupId, newNode);
            });
        },
        [setNodes, applyGroupExpansion]
    );

    /**
     * Programmatically add a node to a group (for agent/API usage)
     */
    const addNodeToGroup = useCallback(
        (node: Partial<Node> & { type: string }, groupId: string): Node | null => {
            const group = getNode(groupId);
            if (!group || group.type !== 'group') {
                console.error('Target is not a group node');
                return null;
            }

            const allNodes = getNodes();

            // Find a good position inside the group (avoid collisions)
            const placement = autoPlaceNode(
                group,
                node.type,
                allNodes,
                { x: 50, y: 50 } // Start inside the group
            );

            const completeNode: Node = {
                id: node.id || `node-${Date.now()}`,
                position: placement.position,
                parentId: groupId,
                data: node.data || {},
                ...node,
            };

            // Atomic update
            setNodes((nodes) => {
                const nodesWithNew = [...nodes, completeNode];
                return applyGroupExpansion(nodesWithNew, groupId, completeNode);
            });

            return completeNode;
        },
        [getNode, getNodes, setNodes, applyGroupExpansion]
    );

    return {
        addNodeWithAutoLayout,
        expandGroupForNode,
        addNodeToGroup,
    };
}
