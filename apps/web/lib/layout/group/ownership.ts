import type { Node } from 'reactflow';
import type { Rect, Point, OwnershipResult } from '../types';
import { rectContains, getAbsoluteRect, getAbsolutePosition } from '../core/geometry';
import { getNestingDepth, isDescendant, getGroupNodes } from './hierarchy';

/**
 * Determine which group (if any) should own a node based on FULL CONTAINMENT.
 *
 * Rules:
 * 1. If the node rect is fully contained by a group, it joins that group
 * 2. If the node rect is not fully contained by any group, it leaves its current group
 * 3. If multiple groups fully contain the node rect, choose the topmost/innermost group
 * 4. Prevent circular nesting (a group cannot be nested inside its descendant)
 *
 * @param nodeAbsRect Absolute rectangle of the node being checked
 * @param nodeId ID of the node being checked
 * @param nodes All nodes in the canvas
 * @returns OwnershipResult with newParentId and relative position
 */
export function determineGroupOwnership(
    nodeAbsRect: Rect,
    nodeId: string,
    nodes: Node[]
): OwnershipResult {
    const groupNodes = getGroupNodes(nodes).filter((g) => g.id !== nodeId);

    // Pick the "best" containing group:
    // - Higher z-index wins (topmost)
    // - If z-index ties, deeper nesting wins (innermost)
    // - Final tie-breaker by id for determinism
    let best:
        | {
              id: string;
              zIndex: number;
              depth: number;
          }
        | undefined;

    for (const group of groupNodes) {
        // Prevent circular nesting: cannot nest into a descendant of the moving node
        if (isDescendant(group.id, nodeId, nodes)) continue;

        const groupAbsRect = getAbsoluteRect(group, nodes);
        if (!rectContains(groupAbsRect, nodeAbsRect)) continue;

        const zIndexRaw = (group.style as any)?.zIndex;
        const zIndex =
            typeof zIndexRaw === 'number'
                ? zIndexRaw
                : typeof zIndexRaw === 'string'
                  ? Number.parseFloat(zIndexRaw) || 0
                  : 0;
        const depth = getNestingDepth(group.id, nodes);

        if (!best) {
            best = { id: group.id, zIndex, depth };
            continue;
        }

        if (zIndex > best.zIndex) {
            best = { id: group.id, zIndex, depth };
            continue;
        }

        if (zIndex === best.zIndex && depth > best.depth) {
            best = { id: group.id, zIndex, depth };
            continue;
        }

        if (zIndex === best.zIndex && depth === best.depth && group.id > best.id) {
            best = { id: group.id, zIndex, depth };
        }
    }

    const newParentId = best?.id;

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
    const ownership = determineGroupOwnership(nodeAbsRect, node.id, nodes);

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
