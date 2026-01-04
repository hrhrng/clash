import type { Node } from 'reactflow';
import type { Rect, Point, OwnershipResult, NodeRect } from '../types';
import { rectContains, rectOverlaps, getAbsoluteRect, toRelativePosition, getAbsolutePosition } from '../core/geometry';
import { isDescendant, getGroupNodes, sortByZIndex } from './hierarchy';

/**
 * Determine which group (if any) should own a node based on OVERLAP
 *
 * Rules:
 * 1. If node overlaps with a group, it joins that group
 * 2. If node is completely outside all groups, it leaves its current group
 * 3. If multiple groups overlap, choose the one with highest z-index (innermost)
 * 4. Prevent circular nesting (a group cannot be nested inside its descendant)
 *
 * @param nodeAbsRect Absolute rectangle of the node being checked
 * @param nodeId ID of the node being checked
 * @param nodes All nodes in the canvas
 * @param currentParentId Current parent ID of the node (for leave detection)
 * @returns OwnershipResult with newParentId and relative position
 */
export function determineGroupOwnership(
    nodeAbsRect: Rect,
    nodeId: string,
    nodes: Node[],
    currentParentId?: string
): OwnershipResult {
    const groupNodes = getGroupNodes(nodes).filter((g) => g.id !== nodeId);

    // Sort by z-index descending (highest first = innermost groups first)
    const sortedGroups = sortByZIndex(groupNodes);

    let newParentId: string | undefined = undefined;

    console.log('[determineGroupOwnership] checking node:', nodeId, 'rect:', nodeAbsRect, 'groups count:', sortedGroups.length);

    for (const group of sortedGroups) {
        // Skip if this group is a descendant of the node (prevent circular nesting)
        if (isDescendant(group.id, nodeId, nodes)) {
            console.log('[determineGroupOwnership] skipping descendant group:', group.id);
            continue;
        }

        const groupAbsRect = getAbsoluteRect(group, nodes);
        const hasOverlap = rectOverlaps(groupAbsRect, nodeAbsRect);

        console.log('[determineGroupOwnership] group:', group.id, 'groupRect:', groupAbsRect, 'hasOverlap:', hasOverlap);

        // Join group if there's any overlap
        if (hasOverlap) {
            newParentId = group.id;
            break; // Take the first (highest z-index) overlapping group
        }
    }

    // If node was in a group and now has no overlap with any group, it leaves
    // But if it still overlaps with its current parent, stay in it
    if (!newParentId && currentParentId) {
        const currentParent = nodes.find((n) => n.id === currentParentId);
        if (currentParent) {
            const parentAbsRect = getAbsoluteRect(currentParent, nodes);
            if (rectOverlaps(parentAbsRect, nodeAbsRect)) {
                newParentId = currentParentId;
            }
        }
    }

    // Calculate relative position
    let relativePosition: Point = { x: nodeAbsRect.x, y: nodeAbsRect.y };

    if (newParentId) {
        const parentGroup = nodes.find((n) => n.id === newParentId);
        if (parentGroup) {
            const parentAbsPos = getAbsolutePosition(parentGroup, nodes);
            relativePosition = {
                x: nodeAbsRect.x - parentAbsPos.x,
                y: nodeAbsRect.y - parentAbsPos.y,
            };
        }
    }

    return {
        newParentId,
        relativePosition,
    };
}

/**
 * Check if a node's ownership has changed after a drag operation
 *
 * @param node The node that was dragged
 * @param nodes All nodes in the canvas
 * @returns Object with hasChanged flag and the ownership result
 */
export function checkOwnershipChange(
    node: Node,
    nodes: Node[]
): { hasChanged: boolean; ownership: OwnershipResult } {
    const nodeAbsRect = getAbsoluteRect(node, nodes);
    const ownership = determineGroupOwnership(nodeAbsRect, node.id, nodes, node.parentId);

    return {
        hasChanged: ownership.newParentId !== node.parentId,
        ownership,
    };
}

/**
 * Update a node's parent and position based on ownership result
 * Returns the updated node
 */
export function applyOwnership(node: Node, ownership: OwnershipResult): Node {
    return {
        ...node,
        parentId: ownership.newParentId,
        position: ownership.relativePosition,
        // Clear extent to allow free dragging out of groups
        extent: undefined,
    };
}

/**
 * Update nodes array with new ownership for a specific node
 */
export function updateNodeOwnership(
    nodes: Node[],
    nodeId: string,
    ownership: OwnershipResult
): Node[] {
    return nodes.map((n) => {
        if (n.id !== nodeId) return n;

        // For group nodes being nested, ensure proper z-index
        if (n.type === 'group' && ownership.newParentId) {
            const parentGroup = nodes.find((p) => p.id === ownership.newParentId);
            const parentZIndex = typeof parentGroup?.style?.zIndex === 'number' ? parentGroup.style.zIndex : 0;

            return {
                ...n,
                parentId: ownership.newParentId,
                position: ownership.relativePosition,
                extent: undefined,
                style: {
                    ...n.style,
                    zIndex: parentZIndex + 1,
                },
            };
        }

        return applyOwnership(n, ownership);
    });
}

/**
 * Remove a node from its parent group (move to root level)
 * Converts position to absolute coordinates
 */
export function removeFromGroup(node: Node, nodes: Node[]): Node {
    if (!node.parentId) return node;

    const absPos = getAbsolutePosition(node, nodes);

    return {
        ...node,
        parentId: undefined,
        position: absPos,
        extent: undefined,
    };
}

/**
 * Move a node into a specific group
 * Converts position to relative coordinates
 */
export function moveIntoGroup(node: Node, groupId: string, nodes: Node[]): Node {
    const group = nodes.find((n) => n.id === groupId);
    if (!group || group.type !== 'group') return node;

    const nodeAbsPos = getAbsolutePosition(node, nodes);
    const groupAbsPos = getAbsolutePosition(group, nodes);

    const relativePos = {
        x: nodeAbsPos.x - groupAbsPos.x,
        y: nodeAbsPos.y - groupAbsPos.y,
    };

    return {
        ...node,
        parentId: groupId,
        position: relativePos,
        extent: undefined,
    };
}
