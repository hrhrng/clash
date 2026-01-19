import type { Node, Edge } from 'reactflow';
import type { Point } from '../types';
import type { TopologyLayoutOptions } from './types';
import { buildTopologyGraph } from './graph-builder';
import { assignColumns } from './column-assignment';
import { packVertically } from './vertical-packing';

/**
 * Main entry point: Relayout all nodes using topology-based algorithm
 *
 * This orchestrates the full topology layout process:
 * 1. Build graph (adjacency lists, in-degree counts)
 * 2. Assign columns via topological sort
 * 3. Pack nodes vertically within columns
 * 4. Apply position updates to nodes
 *
 * @param nodes - Array of all nodes to layout
 * @param edges - Array of all edges (defines dependencies)
 * @param options - Layout configuration options
 * @returns Updated nodes array with new positions
 */
export function relayoutByTopology(
    nodes: Node[],
    edges: Edge[],
    options: TopologyLayoutOptions = {}
): Node[] {
    const {
        columnGap = 120,
        rowGap = 80,
        scopeParentId,
        centerInColumn = true,
        columnSortBy = 'y',
    } = options;

    // Normalize options
    const normalizedOptions: TopologyLayoutOptions = {
        columnGap,
        rowGap,
        scopeParentId,
        centerInColumn,
        columnSortBy,
    };

    // Step 1: Build topology graph
    const graph = buildTopologyGraph(nodes, edges, scopeParentId);

    // Step 2: Assign columns via topological sort
    const columnAssignments = assignColumns(nodes, edges, graph, normalizedOptions);

    // Step 3: Pack nodes vertically and calculate positions
    const positions = packVertically(nodes, columnAssignments, normalizedOptions);

    // Step 4: Apply position updates to nodes
    const updatedNodes = nodes.map((node) => {
        const newPosition = positions.get(node.id);

        if (newPosition) {
            return {
                ...node,
                position: newPosition,
            };
        }

        return node;
    });

    return updatedNodes;
}

/**
 * Relayout multiple parent scopes recursively
 * Useful for laying out nested groups
 *
 * @param nodes - Array of all nodes
 * @param edges - Array of all edges
 * @param parentIds - Array of parent IDs to layout (undefined = root level)
 * @param options - Layout options
 * @returns Updated nodes array
 */
export function relayoutMultipleScopes(
    nodes: Node[],
    edges: Edge[],
    parentIds: Array<string | undefined>,
    options: TopologyLayoutOptions = {}
): Node[] {
    let updatedNodes = [...nodes];

    for (const parentId of parentIds) {
        updatedNodes = relayoutByTopology(updatedNodes, edges, {
            ...options,
            scopeParentId: parentId,
        });
    }

    return updatedNodes;
}

/**
 * Get all unique parent IDs in the node hierarchy
 * Useful for determining which scopes need layout
 *
 * @param nodes - Array of all nodes
 * @returns Array of unique parent IDs (including undefined for root)
 */
export function getAllParentScopes(nodes: Node[]): Array<string | undefined> {
    const parentIds = new Set<string | undefined>();

    // Add root level
    parentIds.add(undefined);

    // Add all unique parent IDs
    for (const node of nodes) {
        if (node.parentId) {
            parentIds.add(node.parentId);
        }
    }

    return Array.from(parentIds);
}

/**
 * Relayout all scopes in the node hierarchy
 * Processes from innermost groups to root level
 *
 * @param nodes - Array of all nodes
 * @param edges - Array of all edges
 * @param options - Layout options
 * @returns Updated nodes array
 */
export function relayoutAllScopes(
    nodes: Node[],
    edges: Edge[],
    options: TopologyLayoutOptions = {}
): Node[] {
    const allScopes = getAllParentScopes(nodes);

    // Sort scopes by nesting depth (innermost first)
    // This ensures child groups are laid out before parent groups
    const sortedScopes = allScopes.sort((a, b) => {
        if (a === undefined) return 1; // Root last
        if (b === undefined) return -1;

        // Calculate nesting depth
        const depthA = getNodeDepth(a, nodes);
        const depthB = getNodeDepth(b, nodes);

        // Process deeper (more nested) groups first
        return depthB - depthA;
    });

    return relayoutMultipleScopes(nodes, edges, sortedScopes, options);
}

/**
 * Get the nesting depth of a node (how many parents it has)
 */
function getNodeDepth(nodeId: string, nodes: Node[]): number {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || !node.parentId) return 0;

    return 1 + getNodeDepth(node.parentId, nodes);
}

/**
 * Calculate the diff between old and new positions
 * Useful for detecting which nodes actually moved
 *
 * @param oldNodes - Original nodes array
 * @param newNodes - Updated nodes array
 * @returns Map of node ID to position change
 */
export function calculatePositionDiff(
    oldNodes: Node[],
    newNodes: Node[]
): Map<string, { old: Point; new: Point; delta: Point }> {
    const diff = new Map<string, { old: Point; new: Point; delta: Point }>();

    for (const newNode of newNodes) {
        const oldNode = oldNodes.find((n) => n.id === newNode.id);

        if (!oldNode || !oldNode.position || !newNode.position) continue;

        const oldPos = oldNode.position;
        const newPos = newNode.position;

        // Check if position actually changed
        if (oldPos.x !== newPos.x || oldPos.y !== newPos.y) {
            diff.set(newNode.id, {
                old: oldPos,
                new: newPos,
                delta: {
                    x: newPos.x - oldPos.x,
                    y: newPos.y - oldPos.y,
                },
            });
        }
    }

    return diff;
}
