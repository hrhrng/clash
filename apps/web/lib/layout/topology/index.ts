/**
 * Topology-based layout system
 *
 * Arranges nodes in columns based on dependency depth via topological sorting.
 * - Column 0 (leftmost): Nodes with no incoming edges
 * - Column N: Nodes whose maximum upstream dependency is in column N-1
 * - Vertical arrangement: Tightly packed within each column
 */

// Types
export type {
    TopologyLayoutOptions,
    TopologyGraphInfo,
    ColumnAssignment,
    ColumnInfo,
} from './types';

// Graph analysis
export {
    buildTopologyGraph,
    detectCycles,
    isReachableFromSource,
} from './graph-builder';

// Column assignment
export {
    assignColumns,
    getColumnMap,
} from './column-assignment';

// Vertical packing
export {
    packVertically,
    calculateColumnInfo,
    calculateTopologyInsertPosition,
} from './vertical-packing';

// Main relayout functions
export {
    relayoutByTopology,
    relayoutMultipleScopes,
    relayoutAllScopes,
    getAllParentScopes,
    calculatePositionDiff,
} from './relayout';
