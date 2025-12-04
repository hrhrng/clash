import ELK, { ElkNode, ElkExtendedEdge } from 'elkjs/lib/elk.bundled';
import { Node, Edge, Position } from 'reactflow';

const elk = new ELK();

// ELK options for a clean flowchart-like layout
const defaultOptions = {
    'elk.algorithm': 'layered',
    'elk.direction': 'RIGHT',
    'elk.spacing.nodeNode': '80', // Horizontal spacing
    'elk.layered.spacing.nodeNodeBetweenLayers': '100', // Horizontal spacing between layers
    'elk.spacing.edgeNode': '30',
    'elk.layered.spacing.edgeNodeBetweenLayers': '30',
    'elk.padding': '[top=50,left=50,bottom=50,right=50]', // Padding inside groups
};

export const getLayoutedElements = async (nodes: Node[], edges: Edge[], options: any = {}) => {
    const isHorizontal = options?.['elk.direction'] === 'RIGHT';

    // 1. Construct the ELK graph hierarchy
    // We need to nest nodes based on parentId
    const graphNodes: ElkNode[] = [];
    const nodeMap = new Map<string, ElkNode>();

    // Initialize all nodes
    nodes.forEach((node) => {
        const elkNode: ElkNode = {
            id: node.id,
            width: node.width ?? 150,
            height: node.height ?? 50,
            // Pass layout options specifically for this node if needed
            layoutOptions: {
                ...defaultOptions,
                ...options,
            },
            children: [],
            edges: [],
        };
        nodeMap.set(node.id, elkNode);
    });

    // Build hierarchy
    nodes.forEach((node) => {
        const elkNode = nodeMap.get(node.id)!;
        if (node.parentId) {
            const parent = nodeMap.get(node.parentId);
            if (parent) {
                parent.children?.push(elkNode);
            } else {
                // Parent not found (maybe filtered out), add to root
                graphNodes.push(elkNode);
            }
        } else {
            graphNodes.push(elkNode);
        }
    });

    // 2. Add edges
    // ELK edges should be added to the *common ancestor* of the source and target.
    // For simplicity, we can often add them to the root or the container group.
    // However, elkjs expects edges to be defined at the level where both nodes are visible.
    // A safe bet for a flat list of edges is to add them to the root, BUT for compound graphs,
    // edges between children of the same group should ideally be in that group.
    // Let's try adding all edges to the root first, as ELK 'layered' can handle global edges.
    // Actually, for correct routing, edges should be in the lowest common ancestor.
    // Let's implement a simple LCA finder or just put them in the root if unsure.
    // Most examples put edges in the root for simple graphs, but for compound...
    // Let's try putting all edges in the root graph object.

    const elkEdges: ElkExtendedEdge[] = edges.map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
    }));

    const graph: ElkNode = {
        id: 'root',
        layoutOptions: {
            ...defaultOptions,
            ...options,
            'elk.algorithm': 'layered',
            'elk.hierarchyHandling': 'INCLUDE_CHILDREN', // Important for groups
        },
        children: graphNodes,
        edges: elkEdges,
    };

    // 3. Run Layout
    try {
        const layoutedGraph = await elk.layout(graph);

        // 4. Map back to React Flow nodes
        const layoutedNodes: Node[] = [];

        const flattenGraph = (node: ElkNode, parentX = 0, parentY = 0) => {
            // The node position from ELK is relative to its parent
            // React Flow also expects relative positions for child nodes!
            // So we just use the x/y directly.

            // Find the original node to preserve data/style
            const originalNode = nodes.find((n) => n.id === node.id);
            if (originalNode) {
                layoutedNodes.push({
                    ...originalNode,
                    position: {
                        x: node.x!,
                        y: node.y!,
                    },
                    width: node.width,
                    height: node.height,
                    // We might need to update style width/height if ELK resized it (e.g. groups)
                    style: {
                        ...originalNode.style,
                        width: node.width,
                        height: node.height,
                    }
                });
            }

            if (node.children) {
                node.children.forEach((child) => flattenGraph(child, 0, 0));
            }
        };

        if (layoutedGraph.children) {
            layoutedGraph.children.forEach((child) => flattenGraph(child));
        }

        return { nodes: layoutedNodes, edges };
    } catch (error) {
        console.error('ELK Layout Failed:', error);
        return { nodes, edges }; // Return original on failure
    }
};

/**
 * Smart Layout: Preserves positions of fixed nodes and arranges others
 */
export const getSmartLayoutedElements = async (
    nodes: Node[],
    edges: Edge[],
    options: { fixedNodeIds?: string[] } = {}
) => {
    const fixedNodeIds = new Set(options.fixedNodeIds || []);

    // ELK options for interactive/incremental layout
    const layoutOptions = {
        ...defaultOptions,
        'elk.algorithm': 'layered',
        'elk.layered.layering.strategy': 'INTERACTIVE',
        'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    };

    // 1. Construct the ELK graph hierarchy
    const graphNodes: ElkNode[] = [];
    const nodeMap = new Map<string, ElkNode>();

    nodes.forEach((node) => {
        const isFixed = fixedNodeIds.has(node.id);

        const elkNode: ElkNode = {
            id: node.id,
            width: node.width ?? 150,
            height: node.height ?? 50,
            layoutOptions: {
                ...layoutOptions,
                // If fixed, provide current position as hint and constraint
                ...(isFixed ? {
                    'elk.position': `(${node.position.x},${node.position.y})`,
                    'org.eclipse.elk.portConstraints': 'FIXED_POS',
                } : {})
            },
            children: [],
            edges: [],
        };
        nodeMap.set(node.id, elkNode);
    });

    // Build hierarchy (same as getLayoutedElements)
    nodes.forEach((node) => {
        const elkNode = nodeMap.get(node.id)!;
        if (node.parentId) {
            const parent = nodeMap.get(node.parentId);
            if (parent) {
                parent.children?.push(elkNode);
            } else {
                graphNodes.push(elkNode);
            }
        } else {
            graphNodes.push(elkNode);
        }
    });

    // 2. Add edges
    const elkEdges: ElkExtendedEdge[] = edges.map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
    }));

    const graph: ElkNode = {
        id: 'root',
        layoutOptions: layoutOptions,
        children: graphNodes,
        edges: elkEdges,
    };

    // 3. Run Layout
    try {
        const layoutedGraph = await elk.layout(graph);

        // 4. Map back to React Flow nodes
        const layoutedNodes: Node[] = [];

        const flattenGraph = (node: ElkNode) => {
            const originalNode = nodes.find((n) => n.id === node.id);
            if (originalNode) {
                layoutedNodes.push({
                    ...originalNode,
                    position: {
                        x: node.x!,
                        y: node.y!,
                    },
                    width: node.width,
                    height: node.height,
                    style: {
                        ...originalNode.style,
                        width: node.width,
                        height: node.height,
                    }
                });
            }

            if (node.children) {
                node.children.forEach((child) => flattenGraph(child));
            }
        };

        if (layoutedGraph.children) {
            layoutedGraph.children.forEach((child) => flattenGraph(child));
        }

        return { nodes: layoutedNodes, edges };
    } catch (error) {
        console.error('ELK Smart Layout Failed:', error);
        return { nodes, edges };
    }
};
