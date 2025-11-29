import { Node } from 'reactflow';

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface NodeRect extends Rect {
    id: string;
    type?: string;
    parentId?: string;
}

/**
 * Get the default size for a node type
 */
export function getNodeSize(type: string): { width: number; height: number } {
    switch (type) {
        case 'group':
            return { width: 400, height: 400 };
        case 'text':
            return { width: 300, height: 200 };
        case 'prompt':
            return { width: 300, height: 150 };
        case 'context':
            return { width: 300, height: 400 };
        case 'image':
        case 'video':
            return { width: 300, height: 300 };
        case 'audio':
            return { width: 300, height: 100 };
        case 'action-badge':
            return { width: 200, height: 80 };
        default:
            return { width: 300, height: 300 };
    }
}

/**
 * Check if two rectangles overlap
 */
export function rectOverlaps(a: Rect, b: Rect): boolean {
    return !(
        a.x + a.width <= b.x ||
        b.x + b.width <= a.x ||
        a.y + a.height <= b.y ||
        b.y + b.height <= a.y
    );
}

/**
 * Check if rectangle a contains point (x, y)
 */
export function rectContainsPoint(rect: Rect, x: number, y: number): boolean {
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

/**
 * Check if rectangle a fully contains rectangle b
 */
export function rectContains(a: Rect, b: Rect): boolean {
    return (
        b.x >= a.x &&
        b.y >= a.y &&
        b.x + b.width <= a.x + a.width &&
        b.y + b.height <= a.y + a.height
    );
}

/**
 * Get absolute position of a node (accounting for parent hierarchy)
 */
export function getAbsolutePosition(node: Node, nodes: Node[]): { x: number; y: number } {
    if (!node.parentId) {
        return { x: node.position.x, y: node.position.y };
    }
    const parent = nodes.find((n) => n.id === node.parentId);
    if (!parent) {
        return { x: node.position.x, y: node.position.y };
    }
    const parentAbsPos = getAbsolutePosition(parent, nodes);
    return {
        x: parentAbsPos.x + node.position.x,
        y: parentAbsPos.y + node.position.y,
    };
}

/**
 * Get absolute rectangle for a node
 */
export function getAbsoluteRect(node: Node, nodes: Node[]): Rect {
    const absPos = getAbsolutePosition(node, nodes);
    const size = getNodeSize(node.type || 'default');
    return {
        x: absPos.x,
        y: absPos.y,
        width: node.width || node.style?.width || size.width,
        height: node.height || node.style?.height || size.height,
    };
}

/**
 * Find a non-overlapping position near the target position
 * This will be used with React Flow's getIntersectingNodes for actual collision detection
 */
export function findNonOverlappingPosition(
    targetPos: { x: number; y: number },
    nodeWidth: number,
    nodeHeight: number,
    existingNodes: Node[],
    nodes: Node[],
    parentId?: string,
    checkOverlap?: (testNode: { position: { x: number; y: number }; width: number; height: number }) => boolean
): { x: number; y: number } {
    const maxAttempts = 50;
    const offsetStep = 50;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Try positions in a spiral pattern
        const angle = (attempt * Math.PI * 2) / 8;
        const distance = Math.floor(attempt / 8) * offsetStep;
        const x = targetPos.x + Math.cos(angle) * distance;
        const y = targetPos.y + Math.sin(angle) * distance;

        // If checkOverlap function is provided (from React Flow), use it
        if (checkOverlap) {
            const testNode = { position: { x, y }, width: nodeWidth, height: nodeHeight };
            if (!checkOverlap(testNode)) {
                return { x, y };
            }
        } else {
            // Fallback to manual checking
            const testRect: Rect = { x, y, width: nodeWidth, height: nodeHeight };
            const relevantNodes = existingNodes.filter(n => n.parentId === parentId && n.type !== 'group');

            const overlaps = relevantNodes.some((existingNode) => {
                const existingRect = getAbsoluteRect(existingNode, nodes);

                let testRectInParentSpace = testRect;
                if (parentId) {
                    const parent = nodes.find(n => n.id === parentId);
                    if (parent) {
                        const parentAbsPos = getAbsolutePosition(parent, nodes);
                        testRectInParentSpace = {
                            x: testRect.x + parentAbsPos.x,
                            y: testRect.y + parentAbsPos.y,
                            width: testRect.width,
                            height: testRect.height,
                        };
                    }
                }

                return rectOverlaps(testRectInParentSpace, existingRect);
            });

            if (!overlaps) {
                return { x, y };
            }
        }
    }

    // Fallback: just offset by attempts * offsetStep
    return {
        x: targetPos.x + maxAttempts * offsetStep,
        y: targetPos.y,
    };
}

/**
 * Calculate the minimum size needed for a group to contain all its children
 */
export function calculateGroupBounds(
    groupId: string,
    nodes: Node[]
): { width: number; height: number } {
    const children = nodes.filter((n) => n.parentId === groupId);

    if (children.length === 0) {
        return { width: 400, height: 400 }; // Default minimum size
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    children.forEach((child) => {
        const size = getNodeSize(child.type || 'default');
        const width = child.width || child.style?.width || size.width;
        const height = child.height || child.style?.height || size.height;

        minX = Math.min(minX, child.position.x);
        minY = Math.min(minY, child.position.y);
        maxX = Math.max(maxX, child.position.x + (width as number));
        maxY = Math.max(maxY, child.position.y + (height as number));
    });

    // Add padding
    const padding = 50;
    const width = Math.max(400, maxX - minX + padding * 2);
    const height = Math.max(400, maxY - minY + padding * 2);

    return { width, height };
}

/**
 * Expand a group to fit a new child node
 */
export function expandGroupToFit(
    group: Node,
    childAbsoluteRect: Rect,
    nodes: Node[]
): { width: number; height: number } {
    const groupAbsPos = getAbsolutePosition(group, nodes);
    const currentWidth = group.style?.width || 400;
    const currentHeight = group.style?.height || 400;

    // Calculate required dimensions
    const padding = 50;
    const requiredWidth = Math.max(
        currentWidth as number,
        childAbsoluteRect.x - groupAbsPos.x + childAbsoluteRect.width + padding
    );
    const requiredHeight = Math.max(
        currentHeight as number,
        childAbsoluteRect.y - groupAbsPos.y + childAbsoluteRect.height + padding
    );

    return {
        width: requiredWidth,
        height: requiredHeight,
    };
}

/**
 * Push/squeeze groups that overlap after expansion
 * Returns updated positions/sizes for affected groups
 */
export function resolveGroupOverlaps(
    expandedGroupId: string,
    nodes: Node[]
): Map<string, { position?: { x: number; y: number }; size?: { width: number; height: number } }> {
    const updates = new Map<string, any>();
    const groupNodes = nodes.filter((n) => n.type === 'group');
    const expandedGroup = nodes.find((n) => n.id === expandedGroupId);

    if (!expandedGroup) return updates;

    const expandedRect = getAbsoluteRect(expandedGroup, nodes);
    const processed = new Set<string>([expandedGroupId]);

    // Find all overlapping groups
    const overlappingGroups = groupNodes.filter((g) => {
        if (g.id === expandedGroupId) return false;
        const gRect = getAbsoluteRect(g, nodes);
        return rectOverlaps(expandedRect, gRect);
    });

    // Push overlapping groups away
    overlappingGroups.forEach((overlappingGroup) => {
        const overlapRect = getAbsoluteRect(overlappingGroup, nodes);

        // Calculate push direction (away from expanded group center)
        const expandedCenter = {
            x: expandedRect.x + expandedRect.width / 2,
            y: expandedRect.y + expandedRect.height / 2,
        };
        const overlapCenter = {
            x: overlapRect.x + overlapRect.width / 2,
            y: overlapRect.y + overlapRect.height / 2,
        };

        const dx = overlapCenter.x - expandedCenter.x;
        const dy = overlapCenter.y - expandedCenter.y;

        // Normalize and push
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance === 0) return;

        const pushDistance = Math.max(expandedRect.width, expandedRect.height) / 2 + 50;
        const pushX = (dx / distance) * pushDistance;
        const pushY = (dy / distance) * pushDistance;

        const newX = expandedCenter.x + pushX - overlapRect.width / 2;
        const newY = expandedCenter.y + pushY - overlapRect.height / 2;

        updates.set(overlappingGroup.id, {
            position: { x: newX, y: newY },
        });

        processed.add(overlappingGroup.id);
    });

    return updates;
}

/**
 * Auto-layout: Place a new node relative to a parent node, avoiding collisions
 */
export function autoPlaceNode(
    parentNode: Node,
    newNodeType: string,
    nodes: Node[],
    offset: { x: number; y: number } = { x: 300, y: 0 }
): { position: { x: number; y: number }; parentId?: string } {
    const newNodeSize = getNodeSize(newNodeType);
    const parentAbsPos = getAbsolutePosition(parentNode, nodes);

    // Default position: offset from parent
    const targetPos = {
        x: parentAbsPos.x + offset.x,
        y: parentAbsPos.y + offset.y,
    };

    // Check if parent is in a group
    const parentGroupId = parentNode.parentId;

    // Find non-overlapping position
    const finalPos = findNonOverlappingPosition(
        targetPos,
        newNodeSize.width,
        newNodeSize.height,
        nodes,
        nodes,
        parentGroupId
    );

    // Convert to relative position if in a group
    if (parentGroupId) {
        const parentGroup = nodes.find(n => n.id === parentGroupId);
        if (parentGroup) {
            const groupAbsPos = getAbsolutePosition(parentGroup, nodes);
            return {
                position: {
                    x: finalPos.x - groupAbsPos.x,
                    y: finalPos.y - groupAbsPos.y,
                },
                parentId: parentGroupId,
            };
        }
    }

    return { position: finalPos };
}
