import type { Node, Edge } from 'reactflow';
import type { Point } from '../types';
import type { ColumnAssignment, ColumnInfo, TopologyLayoutOptions } from './types';
import { getNodeSize } from '../core/geometry';

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
 * Get the actual width of a node
 */
function getNodeWidth(node: Node): number {
    const defaultSize = getNodeSize(node.type || 'default');

    return (
        normalizeDimension(node.width) ??
        normalizeDimension((node as any).measured?.width) ??
        normalizeDimension(node.style?.width) ??
        defaultSize.width
    );
}

/**
 * Get the actual height of a node
 */
function getNodeHeight(node: Node): number {
    const defaultSize = getNodeSize(node.type || 'default');

    return (
        normalizeDimension(node.height) ??
        normalizeDimension((node as any).measured?.height) ??
        normalizeDimension(node.style?.height) ??
        defaultSize.height
    );
}

/**
 * Calculate column information (widths and X positions)
 */
export function calculateColumnInfo(
    nodes: Node[],
    assignments: ColumnAssignment[],
    options: TopologyLayoutOptions
): ColumnInfo[] {
    const { columnGap = 120, scopeParentId } = options;

    // Filter nodes to current scope
    const scopedNodes = nodes.filter((n) => n.parentId === scopeParentId);

    // Group assignments by column
    const columnMap = new Map<number, ColumnAssignment[]>();
    for (const assignment of assignments) {
        const existing = columnMap.get(assignment.column) ?? [];
        existing.push(assignment);
        columnMap.set(assignment.column, existing);
    }

    // Get unique column indices and sort them
    const columnIndices = Array.from(columnMap.keys()).sort((a, b) => a - b);

    const columnInfos: ColumnInfo[] = [];
    let cumulativeX = 80; // Start with initial padding

    for (const columnIndex of columnIndices) {
        const assignmentsInColumn = columnMap.get(columnIndex) ?? [];

        // Calculate max width in this column
        let maxWidth = 0;
        const nodeIds: string[] = [];

        for (const assignment of assignmentsInColumn) {
            const node = scopedNodes.find((n) => n.id === assignment.nodeId);
            if (!node) continue;

            const width = getNodeWidth(node);
            maxWidth = Math.max(maxWidth, width);
            nodeIds.push(assignment.nodeId);
        }

        columnInfos.push({
            index: columnIndex,
            maxWidth,
            xPosition: cumulativeX,
            nodeIds,
        });

        // Update cumulative X for next column
        cumulativeX += maxWidth + columnGap;
    }

    return columnInfos;
}

/**
 * Pack nodes vertically within their columns and calculate final positions
 *
 * Algorithm:
 * 1. Group nodes by column
 * 2. Calculate column widths (max node width in each column)
 * 3. Calculate X positions: cumulative column widths + gaps
 * 4. Pack vertically: Y positions with tight spacing (height + rowGap)
 *
 * @param nodes - Array of all nodes
 * @param assignments - Column assignments from assignColumns()
 * @param options - Layout options
 * @returns Map of node ID to new position
 */
export function packVertically(
    nodes: Node[],
    assignments: ColumnAssignment[],
    options: TopologyLayoutOptions
): Map<string, Point> {
    const { rowGap = 80, centerInColumn = true, scopeParentId } = options;

    // Filter nodes to current scope
    const scopedNodes = nodes.filter((n) => n.parentId === scopeParentId);

    // Calculate column information
    const columnInfos = calculateColumnInfo(nodes, assignments, options);

    // Build a map for quick lookup
    const columnInfoMap = new Map<number, ColumnInfo>();
    for (const info of columnInfos) {
        columnInfoMap.set(info.index, info);
    }

    // Result: node ID -> new position
    const positions = new Map<string, Point>();

    // Group assignments by column (preserve sorted order from assignColumns)
    const columnMap = new Map<number, ColumnAssignment[]>();
    for (const assignment of assignments) {
        const existing = columnMap.get(assignment.column) ?? [];
        existing.push(assignment);
        columnMap.set(assignment.column, existing);
    }

    // Process each column
    for (const [columnIndex, assignmentsInColumn] of columnMap.entries()) {
        const columnInfo = columnInfoMap.get(columnIndex);
        if (!columnInfo) continue;

        let currentY = 80; // Start with top padding

        for (const assignment of assignmentsInColumn) {
            const node = scopedNodes.find((n) => n.id === assignment.nodeId);
            if (!node) continue;

            const nodeWidth = getNodeWidth(node);
            const nodeHeight = getNodeHeight(node);

            // Calculate X position (center in column or align left)
            let x = columnInfo.xPosition;
            if (centerInColumn && nodeWidth < columnInfo.maxWidth) {
                // Center the node horizontally within the column
                x += (columnInfo.maxWidth - nodeWidth) / 2;
            }

            // Set position
            positions.set(node.id, { x, y: currentY });

            // Update Y for next node
            currentY += nodeHeight + rowGap;
        }
    }

    return positions;
}

/**
 * Calculate insert position for a new node using topology logic
 * Used by auto-insert for incremental node placement
 *
 * @param newNodeId - ID of the node being inserted
 * @param nodes - Current nodes array (including the new node)
 * @param edges - Current edges array
 * @param options - Layout options
 * @returns Object with column index and calculated position
 */
export function calculateTopologyInsertPosition(
    newNodeId: string,
    nodes: Node[],
    edges: Edge[],
    options: TopologyLayoutOptions = {}
): { column: number; position: Point } {
    const { rowGap = 80, columnGap = 120, scopeParentId } = options;

    // Import dependencies locally to avoid circular imports
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildTopologyGraph } = require('./graph-builder');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { assignColumns, getColumnMap } = require('./column-assignment');

    // Filter to scoped nodes (excluding the new node for now)
    const existingNodes = nodes.filter(
        (n) => n.id !== newNodeId && n.parentId === scopeParentId
    );
    const newNode = nodes.find((n) => n.id === newNodeId);

    if (!newNode) {
        return { column: 0, position: { x: 80, y: 80 } };
    }

    // Build graph and calculate column assignments for existing nodes
    const graph = buildTopologyGraph(existingNodes, edges, scopeParentId);
    const existingAssignments = assignColumns(existingNodes, edges, graph, options);
    const columnMap = getColumnMap(existingAssignments);

    // Find new node's incoming edges (dependencies)
    const incomingEdges = edges.filter((e) => e.target === newNodeId);

    // Calculate column for new node
    let column = 0;

    if (incomingEdges.length === 0) {
        // No dependencies → column 0 (leftmost)
        column = 0;
    } else {
        // Calculate column = max(upstream columns) + 1
        let maxUpstreamColumn = -1;

        for (const edge of incomingEdges) {
            const sourceNode = existingNodes.find((n) => n.id === edge.source);
            if (!sourceNode) continue;

            // Only consider edges from siblings (same parentId)
            if (sourceNode.parentId !== newNode.parentId) continue;

            const sourceColumn = columnMap.get(edge.source) ?? 0;
            maxUpstreamColumn = Math.max(maxUpstreamColumn, sourceColumn);
        }

        column = maxUpstreamColumn + 1;
    }

    // Find position within the column
    const position = findBottomPositionInColumn(
        column,
        existingNodes,
        columnMap,
        rowGap,
        columnGap
    );

    return { column, position };
}

/**
 * Find the bottom Y position in a specific column
 * Helper for calculateTopologyInsertPosition
 */
function findBottomPositionInColumn(
    column: number,
    nodes: Node[],
    columnMap: Map<string, number>,
    rowGap: number,
    columnGap: number
): Point {
    // Get all nodes in this column
    const nodesInColumn = nodes.filter((n) => columnMap.get(n.id) === column);

    // Calculate X position based on column widths
    const x = calculateColumnX(column, nodes, columnMap, columnGap);

    if (nodesInColumn.length === 0) {
        // First node in column - start at top
        return { x, y: 80 };
    }

    // Find bottom-most node in column
    let maxBottom = 0;
    for (const node of nodesInColumn) {
        if (!node.position) continue;

        const height = getNodeHeight(node);
        const bottom = node.position.y + height;
        maxBottom = Math.max(maxBottom, bottom);
    }

    const y = maxBottom + rowGap;

    return { x, y };
}

/**
 * Calculate X position for a column based on preceding column widths
 */
function calculateColumnX(
    targetColumn: number,
    nodes: Node[],
    columnMap: Map<string, number>,
    columnGap: number
): number {
    let x = 80; // Initial padding

    // Calculate cumulative width up to target column
    for (let col = 0; col < targetColumn; col++) {
        const nodesInCol = nodes.filter((n) => columnMap.get(n.id) === col);

        if (nodesInCol.length === 0) {
            // Empty column - skip it (don't add gap)
            continue;
        }

        // Find max width in this column
        let maxWidth = 0;
        for (const node of nodesInCol) {
            const width = getNodeWidth(node);
            maxWidth = Math.max(maxWidth, width);
        }

        x += maxWidth + columnGap;
    }

    return x;
}
