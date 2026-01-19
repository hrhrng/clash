import type { Node, Edge } from 'reactflow';
import type { TopologyGraphInfo } from './types';

/**
 * Build topology graph from nodes and edges
 *
 * Only counts edges between siblings (nodes with the same parentId).
 * This ensures we're laying out nodes within each group independently.
 *
 * @param nodes - Array of all nodes
 * @param edges - Array of all edges
 * @param scopeParentId - Optional parent ID to scope the graph to (undefined = root level)
 * @returns Graph information with in-degree, out-edges, and in-edges
 */
export function buildTopologyGraph(
    nodes: Node[],
    edges: Edge[],
    scopeParentId?: string | undefined
): TopologyGraphInfo {
    const inDegree = new Map<string, number>();
    const outEdges = new Map<string, string[]>();
    const inEdges = new Map<string, string[]>();

    // Filter nodes to only those in the current scope
    const scopedNodes = nodes.filter((n) => n.parentId === scopeParentId);
    const scopedNodeIds = new Set(scopedNodes.map((n) => n.id));

    // Initialize maps for all scoped nodes
    for (const node of scopedNodes) {
        inDegree.set(node.id, 0);
        outEdges.set(node.id, []);
        inEdges.set(node.id, []);
    }

    // Process edges - only count edges between siblings (same parentId)
    for (const edge of edges) {
        // Only process edges where both source and target are in the scoped node set
        if (!scopedNodeIds.has(edge.source) || !scopedNodeIds.has(edge.target)) {
            continue;
        }

        const sourceNode = scopedNodes.find((n) => n.id === edge.source);
        const targetNode = scopedNodes.find((n) => n.id === edge.target);

        // Skip if either node doesn't exist (shouldn't happen, but be safe)
        if (!sourceNode || !targetNode) continue;

        // Only count edges between siblings (same parentId)
        if (sourceNode.parentId !== targetNode.parentId) continue;

        // Add to out-edges for source
        const outList = outEdges.get(edge.source);
        if (outList && !outList.includes(edge.target)) {
            outList.push(edge.target);
        }

        // Add to in-edges for target
        const inList = inEdges.get(edge.target);
        if (inList && !inList.includes(edge.source)) {
            inList.push(edge.source);
        }

        // Increment in-degree for target
        const currentInDegree = inDegree.get(edge.target) ?? 0;
        inDegree.set(edge.target, currentInDegree + 1);
    }

    return {
        inDegree,
        outEdges,
        inEdges,
    };
}

/**
 * Detect cycles in the graph using DFS
 * Returns the set of nodes involved in cycles
 */
export function detectCycles(
    nodes: Node[],
    graph: TopologyGraphInfo
): Set<string> {
    const cycleNodes = new Set<string>();
    const visiting = new Set<string>();
    const visited = new Set<string>();

    function dfs(nodeId: string): boolean {
        if (visiting.has(nodeId)) {
            // Found a cycle
            cycleNodes.add(nodeId);
            return true;
        }

        if (visited.has(nodeId)) {
            return false;
        }

        visiting.add(nodeId);

        const outgoing = graph.outEdges.get(nodeId) ?? [];
        for (const targetId of outgoing) {
            if (dfs(targetId)) {
                cycleNodes.add(nodeId);
            }
        }

        visiting.delete(nodeId);
        visited.add(nodeId);

        return false;
    }

    // Start DFS from each node
    for (const node of nodes) {
        if (!visited.has(node.id)) {
            dfs(node.id);
        }
    }

    return cycleNodes;
}

/**
 * Check if a node is reachable from any source node (in-degree = 0)
 * Used to identify disconnected components
 */
export function isReachableFromSource(
    nodeId: string,
    graph: TopologyGraphInfo,
    sourceNodes: Set<string>
): boolean {
    const visited = new Set<string>();
    const queue: string[] = Array.from(sourceNodes);

    while (queue.length > 0) {
        const current = queue.shift()!;

        if (visited.has(current)) continue;
        visited.add(current);

        if (current === nodeId) return true;

        const outgoing = graph.outEdges.get(current) ?? [];
        for (const target of outgoing) {
            if (!visited.has(target)) {
                queue.push(target);
            }
        }
    }

    return false;
}
