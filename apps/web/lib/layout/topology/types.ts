/**
 * Configuration options for topology-based layout
 */
export interface TopologyLayoutOptions {
    /** Gap between columns (default: 120) */
    columnGap?: number;

    /** Gap between rows within a column (default: 80) */
    rowGap?: number;

    /** Parent ID to scope the layout to (undefined = root level) */
    scopeParentId?: string | undefined;

    /** Whether to center nodes within their column (default: true) */
    centerInColumn?: boolean;

    /** How to sort nodes within a column (default: 'y') */
    columnSortBy?: 'y' | 'creation' | 'id';
}

/**
 * Graph adjacency information for topology analysis
 */
export interface TopologyGraphInfo {
    /** In-degree count for each node (number of incoming edges) */
    inDegree: Map<string, number>;

    /** Outgoing edges: node ID -> list of target node IDs */
    outEdges: Map<string, string[]>;

    /** Incoming edges: node ID -> list of source node IDs */
    inEdges: Map<string, string[]>;
}

/**
 * Column assignment result for a single node
 */
export interface ColumnAssignment {
    /** Node ID */
    nodeId: string;

    /** Assigned column (0-based, 0 = leftmost) */
    column: number;

    /** Original Y position (for sorting within column) */
    originalY: number;

    /** Whether this is a group node */
    isGroup: boolean;
}

/**
 * Information about a column's layout
 */
export interface ColumnInfo {
    /** Column index (0-based) */
    index: number;

    /** Maximum width of all nodes in this column */
    maxWidth: number;

    /** X position for this column */
    xPosition: number;

    /** Node IDs in this column, sorted by Y position */
    nodeIds: string[];
}
