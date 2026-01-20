import type { Node } from 'reactflow';
import type { Rect, CollisionInfo } from '../types';
import { rectOverlaps, getAbsoluteRect, getOverlapRect } from '../core/geometry';
import { getSiblings } from '../group/hierarchy';

/**
 * Detect collision between two rectangles and return collision info
 */
export function detectCollision(
    nodeAId: string,
    rectA: Rect,
    nodeBId: string,
    rectB: Rect
): CollisionInfo | null {
    if (!rectOverlaps(rectA, rectB)) return null;

    const overlapRect = getOverlapRect(rectA, rectB);
    if (!overlapRect) return null;

    const overlapArea = overlapRect.width * overlapRect.height;

    // Determine push direction based on overlap geometry
    // Prefer horizontal push (right) over vertical (down)
    const overlapWidth = overlapRect.width;
    const overlapHeight = overlapRect.height;

    let pushDirection: CollisionInfo['pushDirection'];
    let pushDistance: number;

    // Calculate centers to determine relative positions
    const centerAX = rectA.x + rectA.width / 2;
    const centerAY = rectA.y + rectA.height / 2;
    const centerBX = rectB.x + rectB.width / 2;
    const centerBY = rectB.y + rectB.height / 2;

    // Determine which direction requires less push
    // nodeB is the one being pushed
    if (centerBX >= centerAX) {
        // B is to the right of A, push B right
        pushDirection = 'right';
        pushDistance = rectA.x + rectA.width - rectB.x;
    } else if (centerBY >= centerAY) {
        // B is below A, push B down
        pushDirection = 'down';
        pushDistance = rectA.y + rectA.height - rectB.y;
    } else if (overlapWidth < overlapHeight) {
        // Less overlap horizontally, push horizontally
        if (centerBX < centerAX) {
            pushDirection = 'left';
            pushDistance = rectB.x + rectB.width - rectA.x;
        } else {
            pushDirection = 'right';
            pushDistance = rectA.x + rectA.width - rectB.x;
        }
    } else {
        // Push vertically
        if (centerBY < centerAY) {
            pushDirection = 'up';
            pushDistance = rectB.y + rectB.height - rectA.y;
        } else {
            pushDirection = 'down';
            pushDistance = rectA.y + rectA.height - rectB.y;
        }
    }

    return {
        nodeA: nodeAId,
        nodeB: nodeBId,
        overlapRect,
        overlapArea,
        pushDirection,
        pushDistance: Math.max(0, pushDistance),
    };
}

/**
 * Find all collisions among a set of nodes
 * Only checks collisions between nodes with the same parentId (siblings)
 */
export function detectAllCollisions(
    nodes: Node[],
    options: {
        excludeIds?: Set<string>;
        onlyParentId?: string; // Only check within this parent
        includeGroups?: boolean; // Include group nodes in collision detection
    } = {}
): CollisionInfo[] {
    const { excludeIds = new Set(), onlyParentId, includeGroups = true } = options;

    // Filter nodes based on options
    let relevantNodes = nodes.filter((n) => {
        if (excludeIds.has(n.id)) return false;
        if (!includeGroups && n.type === 'group') return false;
        if (onlyParentId !== undefined && n.parentId !== onlyParentId) return false;
        return true;
    });

    const collisions: CollisionInfo[] = [];

    // Group nodes by parentId for sibling collision detection
    const nodesByParent = new Map<string | undefined, Node[]>();
    for (const node of relevantNodes) {
        const parentId = node.parentId;
        if (!nodesByParent.has(parentId)) {
            nodesByParent.set(parentId, []);
        }
        nodesByParent.get(parentId)!.push(node);
    }

    // Check collisions within each parent group
    for (const siblings of nodesByParent.values()) {
        for (let i = 0; i < siblings.length; i++) {
            for (let j = i + 1; j < siblings.length; j++) {
                const nodeA = siblings[i];
                const nodeB = siblings[j];

                const rectA = getAbsoluteRect(nodeA, nodes);
                const rectB = getAbsoluteRect(nodeB, nodes);

                const collision = detectCollision(nodeA.id, rectA, nodeB.id, rectB);
                if (collision) {
                    collisions.push(collision);
                }
            }
        }
    }

    return collisions;
}

/**
 * Find collisions caused by a node expanding or moving
 */
export function detectCollisionsForNode(
    nodeId: string,
    nodes: Node[]
): CollisionInfo[] {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return [];

    const nodeRect = getAbsoluteRect(node, nodes);
    const siblings = getSiblings(nodeId, nodes);
    const collisions: CollisionInfo[] = [];

    for (const sibling of siblings) {
        const siblingRect = getAbsoluteRect(sibling, nodes);
        const collision = detectCollision(nodeId, nodeRect, sibling.id, siblingRect);
        if (collision) {
            collisions.push(collision);
        }
    }

    return collisions;
}

/**
 * Check if a specific node has any collisions
 */
export function hasCollisions(nodeId: string, nodes: Node[]): boolean {
    return detectCollisionsForNode(nodeId, nodes).length > 0;
}

/**
 * Get all nodes that collide with a given rectangle
 */
export function getCollidingNodes(
    rect: Rect,
    nodes: Node[],
    excludeId?: string
): Node[] {
    return nodes.filter((node) => {
        if (excludeId && node.id === excludeId) return false;
        const nodeRect = getAbsoluteRect(node, nodes);
        return rectOverlaps(rect, nodeRect);
    });
}
