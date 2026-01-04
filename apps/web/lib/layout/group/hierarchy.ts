import type { Node } from 'reactflow';

/**
 * Check if a node is a descendant of another node (for circular nesting prevention)
 */
export function isDescendant(nodeId: string, potentialAncestorId: string, nodes: Node[]): boolean {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || !node.parentId) return false;
    if (node.parentId === potentialAncestorId) return true;
    return isDescendant(node.parentId, potentialAncestorId, nodes);
}

/**
 * Get all ancestor IDs of a node (from immediate parent to root)
 */
export function getAncestors(nodeId: string, nodes: Node[]): string[] {
    const ancestors: string[] = [];
    let currentId = nodeId;

    while (currentId) {
        const node = nodes.find((n) => n.id === currentId);
        if (!node || !node.parentId) break;
        ancestors.push(node.parentId);
        currentId = node.parentId;
    }

    return ancestors;
}

/**
 * Get all descendant IDs of a node (immediate children and their descendants)
 */
export function getDescendants(nodeId: string, nodes: Node[]): string[] {
    const descendants: string[] = [];
    const children = nodes.filter((n) => n.parentId === nodeId);

    for (const child of children) {
        descendants.push(child.id);
        descendants.push(...getDescendants(child.id, nodes));
    }

    return descendants;
}

/**
 * Get immediate children of a node
 */
export function getChildren(nodeId: string, nodes: Node[]): Node[] {
    return nodes.filter((n) => n.parentId === nodeId);
}

/**
 * Get the nesting depth of a node (0 = root level)
 */
export function getNestingDepth(nodeId: string, nodes: Node[]): number {
    let depth = 0;
    let currentId = nodeId;

    while (currentId) {
        const node = nodes.find((n) => n.id === currentId);
        if (!node || !node.parentId) break;
        currentId = node.parentId;
        depth++;
    }

    return depth;
}

/**
 * Get the root ancestor of a node (the topmost parent that has no parent)
 */
export function getRootAncestor(nodeId: string, nodes: Node[]): string {
    let currentId = nodeId;

    while (true) {
        const node = nodes.find((n) => n.id === currentId);
        if (!node || !node.parentId) return currentId;
        currentId = node.parentId;
    }
}

/**
 * Get all group nodes from a list of nodes
 */
export function getGroupNodes(nodes: Node[]): Node[] {
    return nodes.filter((n) => n.type === 'group');
}

/**
 * Get sibling nodes (nodes with the same parent)
 */
export function getSiblings(nodeId: string, nodes: Node[]): Node[] {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return [];

    return nodes.filter((n) => n.id !== nodeId && n.parentId === node.parentId);
}

/**
 * Sort nodes by z-index (higher z-index first)
 * Nodes without z-index are treated as having z-index 0
 */
export function sortByZIndex(nodes: Node[]): Node[] {
    return [...nodes].sort((a, b) => {
        const aZ = typeof a.style?.zIndex === 'number' ? a.style.zIndex : 0;
        const bZ = typeof b.style?.zIndex === 'number' ? b.style.zIndex : 0;
        return bZ - aZ; // Higher z-index first
    });
}
