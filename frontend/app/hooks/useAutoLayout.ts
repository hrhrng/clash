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
            if (!parentNode) return null;

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
                type: newNode.type,
                position: relativePos,
                parentId: parentGroupId,
                data: newNode.data || {},
                width: nodeSize.width,
                height: nodeSize.height,
                ...newNode,
            };

            // Add the new node first
            setNodes((nodes) => [...nodes, completeNode]);

            // Auto-expand group if needed
            if (parentGroupId) {
                expandGroupForNode(parentGroupId, completeNode, allNodes);
            }

            return completeNode;
        },
        [getNode, getNodes, setNodes, getIntersectingNodes]
    );

    /**
     * Expand a group to fit a node and resolve overlaps
     */
    const expandGroupForNode = useCallback(
        (groupId: string, newNode: Node, currentNodes?: Node[]) => {
            const allNodes = currentNodes || getNodes();
            const parentGroup = allNodes.find((n) => n.id === groupId);

            if (!parentGroup || parentGroup.type !== 'group') return;

            // Calculate absolute position of new node
            const nodeSize = getNodeSize(newNode.type || 'default');
            const groupAbsPos = getAbsolutePosition(parentGroup, allNodes);

            const newNodeAbsRect = {
                x: groupAbsPos.x + newNode.position.x,
                y: groupAbsPos.y + newNode.position.y,
                width: newNode.width || (newNode.style?.width as number) || nodeSize.width,
                height: newNode.height || (newNode.style?.height as number) || nodeSize.height,
            };

            const newSize = expandGroupToFit(parentGroup, newNodeAbsRect, allNodes);
            const currentSize = {
                width: (parentGroup.style?.width as number) || 400,
                height: (parentGroup.style?.height as number) || 400,
            };

            // Only update if size changed
            if (newSize.width > currentSize.width || newSize.height > currentSize.height) {
                setNodes((nodes) => {
                    // Update group size
                    const updatedNodes = nodes.map((n) => {
                        if (n.id === groupId) {
                            return {
                                ...n,
                                style: { ...n.style, width: newSize.width, height: newSize.height },
                            };
                        }
                        return n;
                    });

                    // Check for overlaps and resolve
                    const overlaps = resolveGroupOverlaps(groupId, updatedNodes);
                    overlaps.forEach((update, nodeId) => {
                        const idx = updatedNodes.findIndex((n) => n.id === nodeId);
                        if (idx !== -1) {
                            if (update.position) {
                                updatedNodes[idx] = {
                                    ...updatedNodes[idx],
                                    position: update.position,
                                };
                            }
                            if (update.size) {
                                updatedNodes[idx] = {
                                    ...updatedNodes[idx],
                                    style: {
                                        ...updatedNodes[idx].style,
                                        width: update.size.width,
                                        height: update.size.height,
                                    },
                                };
                            }
                        }
                    });

                    return updatedNodes;
                });
            }
        },
        [getNodes, setNodes]
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
                type: node.type,
                position: placement.position,
                parentId: groupId,
                data: node.data || {},
                ...node,
            };

            // Add the node
            setNodes((nodes) => [...nodes, completeNode]);

            // Expand group if needed
            expandGroupForNode(groupId, completeNode, allNodes);

            return completeNode;
        },
        [getNode, getNodes, setNodes, expandGroupForNode]
    );

    return {
        addNodeWithAutoLayout,
        expandGroupForNode,
        addNodeToGroup,
    };
}
