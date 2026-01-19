import type { Node, Edge } from 'reactflow';
import type { TopologyGraphInfo, ColumnAssignment, TopologyLayoutOptions } from './types';
import { buildTopologyGraph, detectCycles, isReachableFromSource } from './graph-builder';

/**
 * Get all descendant nodes of a given node (children, grandchildren, etc.)
 */
function getDescendants(nodeId: string, nodes: Node[]): Node[] {
    const descendants: Node[] = [];
    const children = nodes.filter((n) => n.parentId === nodeId);

    for (const child of children) {
        descendants.push(child);
        descendants.push(...getDescendants(child.id, nodes));
    }

    return descendants;
}

/**
 * Calculate the maximum column of all descendants for a group node
 * This ensures the group is positioned to encompass all its content
 */
function calculateGroupColumn(
    groupNode: Node,
    nodes: Node[],
    edges: Edge[],
    columnAssignments: Map<string, number>
): number {
    const descendants = getDescendants(groupNode.id, nodes);

    if (descendants.length === 0) {
        // Empty group - treat as having no dependencies (column 0)
        return 0;
    }

    // Get max column of all descendants
    let maxDescendantColumn = 0;

    for (const descendant of descendants) {
        // If descendant column not yet calculated, calculate it recursively
        let descendantColumn = columnAssignments.get(descendant.id);

        if (descendantColumn === undefined) {
            if (descendant.type === 'group') {
                // Recursive group - calculate its column
                descendantColumn = calculateGroupColumn(descendant, nodes, edges, columnAssignments);
            } else {
                // Regular node - calculate based on dependencies
                const descendantGraph = buildTopologyGraph(nodes, edges, descendant.parentId);
                const incomingEdges = descendantGraph.inEdges.get(descendant.id) ?? [];

                if (incomingEdges.length === 0) {
                    descendantColumn = 0;
                } else {
                    let maxUpstream = -1;
                    for (const sourceId of incomingEdges) {
                        const sourceColumn = columnAssignments.get(sourceId) ?? 0;
                        maxUpstream = Math.max(maxUpstream, sourceColumn);
                    }
                    descendantColumn = maxUpstream + 1;
                }
            }

            columnAssignments.set(descendant.id, descendantColumn);
        }

        maxDescendantColumn = Math.max(maxDescendantColumn, descendantColumn);
    }

    return maxDescendantColumn;
}

/**
 * Assign columns to nodes based on topological sort
 *
 * Algorithm:
 * 1. Build graph (adjacency lists, in-degree counts)
 * 2. Find sources (in-degree = 0) → assign to column 0
 * 3. BFS/topological sort:
 *    - For each node, column = max(parent columns) + 1
 *    - Special case: Groups calculate max child column first
 * 4. Handle unreachable nodes (cycles/disconnected) → column 0
 * 5. Sort nodes within each column by original Y position
 *
 * @param nodes - Array of all nodes
 * @param edges - Array of all edges
 * @param graph - Pre-built topology graph
 * @param options - Layout options
 * @returns Array of column assignments with original Y positions
 */
export function assignColumns(
    nodes: Node[],
    edges: Edge[],
    graph: TopologyGraphInfo,
    options: TopologyLayoutOptions = {}
): ColumnAssignment[] {
    const { scopeParentId, columnSortBy = 'y' } = options;

    // Filter nodes to current scope
    const scopedNodes = nodes.filter((n) => n.parentId === scopeParentId);
    const scopedNodeIds = new Set(scopedNodes.map((n) => n.id));

    // Column assignments
    const columnAssignments = new Map<string, number>();

    // Build working copy of in-degrees (we'll mutate this during topological sort)
    const workingInDegree = new Map<string, number>();
    for (const [nodeId, degree] of graph.inDegree.entries()) {
        if (scopedNodeIds.has(nodeId)) {
            workingInDegree.set(nodeId, degree);
        }
    }

    // Find source nodes (in-degree = 0)
    const sources = new Set<string>();
    for (const node of scopedNodes) {
        const degree = workingInDegree.get(node.id) ?? 0;
        if (degree === 0) {
            sources.add(node.id);
        }
    }

    // Queue for BFS topological sort
    const queue: Array<{ nodeId: string; column: number }> = [];

    // Add all source nodes to column 0
    for (const sourceId of sources) {
        const node = scopedNodes.find((n) => n.id === sourceId);
        if (!node) continue;

        if (node.type === 'group') {
            // Group node - calculate max descendant column
            const groupColumn = calculateGroupColumn(node, nodes, edges, columnAssignments);
            columnAssignments.set(sourceId, groupColumn);
            queue.push({ nodeId: sourceId, column: groupColumn });
        } else {
            columnAssignments.set(sourceId, 0);
            queue.push({ nodeId: sourceId, column: 0 });
        }
    }

    // Process queue (topological sort)
    while (queue.length > 0) {
        const { nodeId } = queue.shift()!;

        // Get outgoing edges
        const outgoing = graph.outEdges.get(nodeId) ?? [];

        for (const targetId of outgoing) {
            // Decrease in-degree
            const currentDegree = workingInDegree.get(targetId) ?? 0;
            workingInDegree.set(targetId, currentDegree - 1);

            // If in-degree becomes 0, calculate column and add to queue
            if (currentDegree - 1 === 0) {
                const targetNode = scopedNodes.find((n) => n.id === targetId);
                if (!targetNode) continue;

                // Calculate column = max(upstream columns) + 1
                const incomingEdges = graph.inEdges.get(targetId) ?? [];
                let maxUpstreamColumn = -1;

                for (const sourceId of incomingEdges) {
                    const sourceColumn = columnAssignments.get(sourceId);
                    if (sourceColumn !== undefined) {
                        maxUpstreamColumn = Math.max(maxUpstreamColumn, sourceColumn);
                    }
                }

                const targetColumn = maxUpstreamColumn + 1;

                if (targetNode.type === 'group') {
                    // Group node - use max of dependency column and descendant column
                    const groupColumn = calculateGroupColumn(targetNode, nodes, edges, columnAssignments);
                    const finalColumn = Math.max(targetColumn, groupColumn);
                    columnAssignments.set(targetId, finalColumn);
                    queue.push({ nodeId: targetId, column: finalColumn });
                } else {
                    columnAssignments.set(targetId, targetColumn);
                    queue.push({ nodeId: targetId, column: targetColumn });
                }
            }
        }
    }

    // Handle nodes not reached (cycles or disconnected components)
    // Detect cycles
    const cycleNodes = detectCycles(scopedNodes, graph);

    for (const node of scopedNodes) {
        if (columnAssignments.has(node.id)) continue;

        // Node not assigned - either in cycle or disconnected
        if (cycleNodes.has(node.id) || !isReachableFromSource(node.id, graph, sources)) {
            // Place at column 0 (leftmost)
            if (node.type === 'group') {
                const groupColumn = calculateGroupColumn(node, nodes, edges, columnAssignments);
                columnAssignments.set(node.id, groupColumn);
            } else {
                columnAssignments.set(node.id, 0);
            }
        }
    }

    // Build result with original Y positions for sorting
    const result: ColumnAssignment[] = [];

    for (const node of scopedNodes) {
        const column = columnAssignments.get(node.id) ?? 0;

        result.push({
            nodeId: node.id,
            column,
            originalY: node.position?.y ?? 0,
            isGroup: node.type === 'group',
        });
    }

    // Sort within each column based on columnSortBy option
    result.sort((a, b) => {
        // First, sort by column
        if (a.column !== b.column) {
            return a.column - b.column;
        }

        // Within column, sort by specified criteria
        switch (columnSortBy) {
            case 'y':
                return a.originalY - b.originalY;
            case 'id':
                return a.nodeId.localeCompare(b.nodeId);
            case 'creation':
                // Assume node ID order roughly corresponds to creation order
                return a.nodeId.localeCompare(b.nodeId);
            default:
                return a.originalY - b.originalY;
        }
    });

    return result;
}

/**
 * Get column assignments as a simple map (node ID -> column number)
 */
export function getColumnMap(assignments: ColumnAssignment[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const assignment of assignments) {
        map.set(assignment.nodeId, assignment.column);
    }
    return map;
}
