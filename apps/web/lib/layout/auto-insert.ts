/**
 * Auto-insert layout logic for new nodes
 *
 * Rules:
 * 1. If node has a reference (source node in same group via edge) → insert to the right of reference
 * 2. If no valid reference → place at the bottom of the group/canvas
 * 3. Chain-push: if insertion causes overlap, push overlapping nodes to the right recursively
 */

import type { Node, Edge } from 'reactflow';
import type { Point, Rect } from './types';
import { calculateTopologyInsertPosition } from './topology/vertical-packing';
import { getNodeSize, rectOverlaps } from './core/geometry';

/**
 * Maximum dimension for media nodes (matches VideoNode.MAX_MEDIA_DIMENSION)
 */
const MAX_MEDIA_DIMENSION = 500;

/**
 * Calculate scaled dimensions from natural width/height
 */
function calculateScaledDimensions(naturalWidth: number, naturalHeight: number): { width: number; height: number } {
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
 * Special position value indicating a node needs auto-layout
 * Python backend should use this value when adding nodes
 */
export const NEEDS_LAYOUT_POSITION: Point = { x: -1, y: -1 };

/**
 * Default gap between nodes
 * Increased to 80 to accommodate larger media nodes (400-500px)
 */
const DEFAULT_GAP = 80;

/**
 * Check if a node needs auto-layout based on its position
 */
export function needsAutoLayout(node: Node): boolean {
    // Guard against undefined position - treat as needing layout
    if (!node.position) return true;

    return (
        node.position.x === NEEDS_LAYOUT_POSITION.x &&
        node.position.y === NEEDS_LAYOUT_POSITION.y
    );
}

/**
 * Find the reference node for a given node
 * Reference is the source node connected via an edge, in the same group
 */
export function findReferenceNode(
    nodeId: string,
    nodes: Node[],
    edges: Edge[]
): Node | null {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;

    // Find incoming edge (where this node is the target)
    const incomingEdge = edges.find((e) => e.target === nodeId);
    if (!incomingEdge) return null;

    // Find source node
    const sourceNode = nodes.find((n) => n.id === incomingEdge.source);
    if (!sourceNode) return null;

    // Check if source is in the same group
    if (sourceNode.parentId !== node.parentId) return null;

    return sourceNode;
}

/**
 * Normalize dimension value (handle string/number/undefined)
 */
function normalizeDimension(value: unknown): number | undefined {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}

/**
 * Get the actual height of a node, considering explicit dimensions, natural dimensions, style, and default
 *
 * IMPORTANT: We DON'T use measured dimensions here because:
 * 1. measured dimensions can fluctuate during layout updates
 * 2. For media nodes, height should be based on actual dimensions (stored in node.height or node.data.naturalHeight)
 * 3. Using measured can cause nodes to resize when other nodes are added
 */
function getNodeHeight(node: Node): number {
    const defaultSize = getNodeSize(node.type || 'default');

    // Priority: node.height > calculated from naturalWidth/naturalHeight > node.style.height > default
    // Explicitly ignore measured.height to prevent size fluctuations
    return (
        normalizeDimension(node.height) ??
        (node.data?.naturalWidth && node.data?.naturalHeight
            ? calculateScaledDimensions(node.data.naturalWidth, node.data.naturalHeight).height
            : undefined) ??
        normalizeDimension(node.style?.height) ??
        defaultSize.height
    );
}

/**
 * Find the bottom-most Y position in a group or canvas
 */
export function findBottomY(parentId: string | undefined, nodes: Node[]): number {
    const siblings = nodes.filter(
        (n) => n.parentId === parentId && n.position?.x !== NEEDS_LAYOUT_POSITION.x
    );

    if (siblings.length === 0) return DEFAULT_GAP;

    let maxBottom = 0;
    for (const sibling of siblings) {
        if (!sibling.position) continue;
        const height = getNodeHeight(sibling);
        const bottom = sibling.position.y + height;
        if (bottom > maxBottom) maxBottom = bottom;
    }

    return maxBottom + DEFAULT_GAP;
}

/**
 * Get the actual width of a node, considering explicit dimensions, natural dimensions, style, and default
 *
 * IMPORTANT: We DON'T use measured dimensions here because:
 * 1. measured dimensions can fluctuate during layout updates
 * 2. For media nodes, width should be based on actual dimensions (stored in node.width or node.data.naturalWidth)
 * 3. Using measured can cause nodes to resize when other nodes are added
 */
function getNodeWidth(node: Node): number {
    const defaultSize = getNodeSize(node.type || 'default');

    // Priority: node.width > calculated from naturalWidth/naturalHeight > node.style.width > default
    // Explicitly ignore measured.width to prevent size fluctuations
    return (
        normalizeDimension(node.width) ??
        (node.data?.naturalWidth && node.data?.naturalHeight
            ? calculateScaledDimensions(node.data.naturalWidth, node.data.naturalHeight).width
            : undefined) ??
        normalizeDimension(node.style?.width) ??
        defaultSize.width
    );
}

/**
 * Calculate insertion position for a new node
 */
export function calculateInsertPosition(
    node: Node,
    referenceNode: Node | null,
    nodes: Node[]
): Point {
    if (referenceNode) {
        // Has reference: insert to the right
        const refWidth = getNodeWidth(referenceNode);

        return {
            x: (referenceNode.position?.x ?? 0) + refWidth + DEFAULT_GAP,
            y: referenceNode.position?.y ?? 0,
        };
    } else {
        // No reference: place at bottom
        const bottomY = findBottomY(node.parentId, nodes);
        return {
            x: DEFAULT_GAP,
            y: bottomY,
        };
    }
}

/**
 * Get nodes that overlap with the given rect (for chain-push detection)
 * Only considers siblings (nodes in the same group)
 */
export function getOverlappingSiblings(
    nodeId: string,
    nodeRect: Rect,
    parentId: string | undefined,
    nodes: Node[]
): Node[] {
    return nodes.filter((n) => {
        if (n.id === nodeId) return false;
        if (n.parentId !== parentId) return false;
        if (n.type === 'group') return false; // Don't push groups, let them resize
        if (!n.position || n.position.x === NEEDS_LAYOUT_POSITION.x) return false; // Skip nodes waiting for layout

        const siblingWidth = getNodeWidth(n);
        const siblingHeight = getNodeHeight(n);

        const relSiblingRect: Rect = {
            x: n.position.x,
            y: n.position.y,
            width: siblingWidth,
            height: siblingHeight,
        };

        return rectOverlaps(nodeRect, relSiblingRect);
    });
}

/**
 * Chain-push nodes to the right to resolve overlaps
 *
 * Algorithm:
 * 1. Find all siblings that overlap with the placed node
 * 2. Push each overlapping node to the right (just enough to clear)
 * 3. For each pushed node, recursively check for new overlaps
 * 4. Continue until no more overlaps
 */
export function chainPushRight(
    triggerNodeId: string,
    nodes: Node[],
    maxIterations: number = 20
): Map<string, Point> {
    const positionUpdates = new Map<string, Point>();

    // Build working copy of positions
    const workingPositions = new Map<string, Point>();
    for (const node of nodes) {
        // Skip nodes without position - they'll be auto-laid out separately
        if (!node.position) continue;
        workingPositions.set(node.id, { ...node.position });
    }

    // Queue of nodes to check for overlaps
    const toCheck = new Set<string>([triggerNodeId]);
    const checked = new Set<string>();
    let iterations = 0;

    while (toCheck.size > 0 && iterations < maxIterations) {
        iterations++;
        const next = toCheck.values().next();
        if (next.done) break;
        const nodeId = next.value;
        toCheck.delete(nodeId);

        if (checked.has(nodeId)) continue;
        checked.add(nodeId);

        const node = nodes.find((n) => n.id === nodeId);
        if (!node) continue;

        const nodePos = workingPositions.get(nodeId)!;
        const nodeWidth = getNodeWidth(node);
        const nodeHeight = getNodeHeight(node);

        const nodeRect: Rect = {
            x: nodePos.x,
            y: nodePos.y,
            width: nodeWidth,
            height: nodeHeight,
        };

        // Find overlapping siblings using working positions
        const siblings = nodes.filter((n) => {
            if (n.id === nodeId) return false;
            if (n.parentId !== node.parentId) return false;
            if (n.type === 'group') return false;

            const pos = workingPositions.get(n.id);
            if (!pos) return false; // Skip nodes that don't have a position in working map

            if (pos.x === NEEDS_LAYOUT_POSITION.x) return false;
            return true;
        });

        for (const sibling of siblings) {
            const siblingPos = workingPositions.get(sibling.id)!;
            const siblingWidth = getNodeWidth(sibling);
            const siblingHeight = getNodeHeight(sibling);

            const siblingRect: Rect = {
                x: siblingPos.x,
                y: siblingPos.y,
                width: siblingWidth,
                height: siblingHeight,
            };

            // Check if actually overlapping
            if (!rectOverlaps(nodeRect, siblingRect)) continue;

            // Calculate push distance (push sibling to the right)
            const pushDistance = nodeRect.x + nodeRect.width + DEFAULT_GAP - siblingPos.x;

            if (pushDistance > 0) {
                const newSiblingPos: Point = {
                    x: siblingPos.x + pushDistance,
                    y: siblingPos.y,
                };

                workingPositions.set(sibling.id, newSiblingPos);
                positionUpdates.set(sibling.id, newSiblingPos);

                // Add to check queue for chain reaction
                toCheck.add(sibling.id);
            }
        }
    }

    return positionUpdates;
}

export interface AutoInsertResult {
    /** The calculated position for the new node */
    position: Point;
    /** Position updates for nodes that were pushed */
    pushedNodes: Map<string, Point>;
    /** Whether a reference node was found */
    hasReference: boolean;
    /** The reference node ID if found */
    referenceNodeId?: string;
}

/**
 * Main entry point: auto-insert a node using topology-based positioning
 *
 * New behavior:
 * - Calculates the correct topology column based on dependencies
 * - Places node at the bottom of that column
 * - No chain-push needed (incremental placement)
 */
export function autoInsertNode(
    nodeId: string,
    nodes: Node[],
    edges: Edge[]
): AutoInsertResult {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) {
        return {
            position: { x: DEFAULT_GAP, y: DEFAULT_GAP },
            pushedNodes: new Map(),
            hasReference: false,
        };
    }

    // Use topology-based positioning
    const { column, position } = calculateTopologyInsertPosition(
        nodeId,
        nodes,
        edges,
        {
            rowGap: DEFAULT_GAP,
            columnGap: 120,
            scopeParentId: node.parentId,
        }
    );

    // No chain-push needed with topology layout - nodes are placed at bottom of column
    return {
        position,
        pushedNodes: new Map(), // No nodes pushed
        hasReference: column > 0, // Has reference if not in column 0
        referenceNodeId: undefined, // We don't track specific reference anymore
    };
}

/**
 * Apply auto-insert result to a nodes array
 */
export function applyAutoInsertResult(
    nodes: Node[],
    nodeId: string,
    result: AutoInsertResult
): Node[] {
    return nodes.map((node) => {
        if (node.id === nodeId) {
            return { ...node, position: result.position };
        }

        const pushedPosition = result.pushedNodes.get(node.id);
        if (pushedPosition) {
            return { ...node, position: pushedPosition };
        }

        return node;
    });
}

/**
 * Process all nodes that need auto-layout
 */
export function processAutoLayoutNodes(
    nodes: Node[],
    edges: Edge[]
): { nodes: Node[]; processed: string[] } {
    const nodesToLayout = nodes.filter(needsAutoLayout);
    const processed: string[] = [];

    if (nodesToLayout.length === 0) {
        return { nodes, processed };
    }

    let updatedNodes = [...nodes];

    for (const node of nodesToLayout) {
        const result = autoInsertNode(node.id, updatedNodes, edges);
        updatedNodes = applyAutoInsertResult(updatedNodes, node.id, result);
        processed.push(node.id);
    }

    return { nodes: updatedNodes, processed };
}
