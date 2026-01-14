import type { Node } from 'reactflow';
import type { Point } from '../types';
import { getAbsoluteRect } from '../core/geometry';

type RectLike = { x: number; y: number; width: number; height: number };

function overlaps(a: RectLike, b: RectLike): boolean {
    return !(
        a.x + a.width <= b.x ||
        b.x + b.width <= a.x ||
        a.y + a.height <= b.y ||
        b.y + b.height <= a.y
    );
}

function getNodeSize(node: Node, all: Node[]): { width: number; height: number } {
    const r = getAbsoluteRect(node, all);
    return { width: r.width, height: r.height };
}

function computeOrigin(nodes: Node[]): Point {
    let minX = Infinity;
    let minY = Infinity;
    for (const n of nodes) {
        minX = Math.min(minX, n.position.x);
        minY = Math.min(minY, n.position.y);
    }
    return {
        x: Number.isFinite(minX) ? minX : 0,
        y: Number.isFinite(minY) ? minY : 0,
    };
}

function rectCenterY(rect: RectLike): number {
    return rect.y + rect.height / 2;
}

function rectCenterX(rect: RectLike): number {
    return rect.x + rect.width / 2;
}

function verticalOverlap(a: RectLike, b: RectLike): number {
    const top = Math.max(a.y, b.y);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    return Math.max(0, bottom - top);
}

function horizontalOverlap(a: RectLike, b: RectLike): number {
    const left = Math.max(a.x, b.x);
    const right = Math.min(a.x + a.width, b.x + b.width);
    return Math.max(0, right - left);
}

type RelayoutGridOptions = {
    gapX?: number;
    gapY?: number;
    rowOverlapThreshold?: number; // 0..1, fraction of min(height)
    colOverlapThreshold?: number; // 0..1, fraction of min(width)
    centerInCell?: boolean;
    /**
     * Limit relayout to the first layer under a specific parentId.
     * - `undefined` means root-level (no parent).
     * - When omitted, all sibling sets are relayouted.
     */
    scopeParentId?: string | undefined;
};

type Row = {
    ids: string[];
    span: RectLike;
    centerY: number;
};

type Column = {
    ids: string[];
    span: RectLike;
    centerX: number;
};

function assignToRows(
    nodes: Node[],
    rectsById: Map<string, RectLike>,
    opts: Required<Pick<RelayoutGridOptions, 'gapY' | 'rowOverlapThreshold'>>
): Row[] {
    const ordered = nodes.slice().sort((a, b) => {
        const ra = rectsById.get(a.id)!;
        const rb = rectsById.get(b.id)!;
        if (ra.y !== rb.y) return ra.y - rb.y;
        if (ra.x !== rb.x) return ra.x - rb.x;
        return a.id.localeCompare(b.id);
    });

    const rows: Row[] = [];

    for (const n of ordered) {
        const rect = rectsById.get(n.id)!;

        let bestIdx = -1;
        let bestScore = -Infinity;
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const ov = verticalOverlap(rect, row.span);
            const denom = Math.min(rect.height, row.span.height) || 1;
            const frac = ov / denom;

            const centerDist = Math.abs(rectCenterY(rect) - row.centerY);
            const score = frac * 1000 - centerDist;

            const closeEnough = frac >= opts.rowOverlapThreshold || centerDist <= opts.gapY / 2;
            if (closeEnough && score > bestScore) {
                bestScore = score;
                bestIdx = i;
            }
        }

        if (bestIdx === -1) {
            rows.push({
                ids: [n.id],
                span: { ...rect },
                centerY: rectCenterY(rect),
            });
            continue;
        }

        const row = rows[bestIdx];
        row.ids.push(n.id);

        const minY = Math.min(row.span.y, rect.y);
        const maxY = Math.max(row.span.y + row.span.height, rect.y + rect.height);
        const minX = Math.min(row.span.x, rect.x);
        const maxX = Math.max(row.span.x + row.span.width, rect.x + rect.width);
        row.span = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };

        const ys = row.ids.map((id) => rectCenterY(rectsById.get(id)!));
        row.centerY = ys.reduce((a, b) => a + b, 0) / ys.length;
    }

    // Sort rows top-to-bottom by centerY
    rows.sort((a, b) => a.centerY - b.centerY);

    // Within each row, sort by x
    for (const row of rows) {
        row.ids.sort((a, b) => {
            const ra = rectsById.get(a)!;
            const rb = rectsById.get(b)!;
            if (ra.x !== rb.x) return ra.x - rb.x;
            return a.localeCompare(b);
        });
    }

    return rows;
}

function assignToColumns(
    rows: Row[],
    rectsById: Map<string, RectLike>,
    opts: Required<Pick<RelayoutGridOptions, 'gapX' | 'colOverlapThreshold'>>
): { columnOrder: Column[]; colIndexById: Map<string, number> } {
    const columns: Column[] = [];
    const colIndexById = new Map<string, number>();

    for (const row of rows) {
        const usedCols = new Set<number>();

        for (const id of row.ids) {
            const rect = rectsById.get(id)!;

            let bestIdx = -1;
            let bestScore = -Infinity;

            for (let i = 0; i < columns.length; i++) {
                if (usedCols.has(i)) continue;

                const col = columns[i];
                const ov = horizontalOverlap(rect, col.span);
                const denom = Math.min(rect.width, col.span.width) || 1;
                const frac = ov / denom;

                const centerDist = Math.abs(rectCenterX(rect) - col.centerX);
                const score = frac * 1000 - centerDist;

                const closeEnough = frac >= opts.colOverlapThreshold || centerDist <= opts.gapX / 2;
                if (closeEnough && score > bestScore) {
                    bestScore = score;
                    bestIdx = i;
                }
            }

            if (bestIdx === -1) {
                const idx = columns.length;
                columns.push({
                    ids: [id],
                    span: { ...rect },
                    centerX: rectCenterX(rect),
                });
                usedCols.add(idx);
                colIndexById.set(id, idx);
                continue;
            }

            const col = columns[bestIdx];
            col.ids.push(id);

            const minY = Math.min(col.span.y, rect.y);
            const maxY = Math.max(col.span.y + col.span.height, rect.y + rect.height);
            const minX = Math.min(col.span.x, rect.x);
            const maxX = Math.max(col.span.x + col.span.width, rect.x + rect.width);
            col.span = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };

            const xs = col.ids.map((nid) => rectCenterX(rectsById.get(nid)!));
            col.centerX = xs.reduce((a, b) => a + b, 0) / xs.length;

            usedCols.add(bestIdx);
            colIndexById.set(id, bestIdx);
        }
    }

    // Columns left-to-right by centerX
    const columnOrder = columns.slice().sort((a, b) => a.centerX - b.centerX);
    const remap = new Map<number, number>();
    for (let i = 0; i < columnOrder.length; i++) {
        const originalIndex = columns.indexOf(columnOrder[i]);
        remap.set(originalIndex, i);
    }

    for (const [id, idx] of colIndexById.entries()) {
        const mapped = remap.get(idx);
        if (typeof mapped === 'number') colIndexById.set(id, mapped);
    }

    return { columnOrder, colIndexById };
}

/**
 * "Measured grid" relayout that keeps relative ordering but aligns nodes into rows/columns.
 *
 * For each sibling set (same parentId):
 * - infer rows by vertical overlap / proximity
 * - infer columns across rows by x overlap / proximity
 * - compute each column width = max node width assigned to that column
 * - compute each row height = max node height in that row
 * - place nodes into a grid with fixed gaps, optionally centering in each cell
 */
export function relayoutToGrid(nodes: Node[], options: RelayoutGridOptions = {}): Node[] {
    const hasScope = Object.prototype.hasOwnProperty.call(options, 'scopeParentId');
    const opts: {
        gapX: number;
        gapY: number;
        rowOverlapThreshold: number;
        colOverlapThreshold: number;
        centerInCell: boolean;
        scopeParentId: string | undefined;
    } = {
        gapX: options.gapX ?? 80,
        gapY: options.gapY ?? 80,
        rowOverlapThreshold: options.rowOverlapThreshold ?? 0.25,
        colOverlapThreshold: options.colOverlapThreshold ?? 0.25,
        centerInCell: options.centerInCell ?? true,
        scopeParentId: options.scopeParentId,
    };

    const byParent = new Map<string | undefined, Node[]>();
    for (const n of nodes) {
        // ReactFlow's `parentId` is optional, but our persisted/Loro data may carry `null`.
        // Treat `null` and `undefined` as the same "root" parent bucket.
        const key = (n as unknown as { parentId?: string | null }).parentId ?? undefined;
        const list = byParent.get(key) ?? [];
        list.push(n);
        byParent.set(key, list);
    }

    const rectsById = new Map<string, RectLike>();
    for (const n of nodes) {
        rectsById.set(n.id, getAbsoluteRect(n, nodes));
    }

    const nextPosById = new Map<string, Point>();

    const entries =
        hasScope
            ? [[opts.scopeParentId, byParent.get(opts.scopeParentId) ?? []] as const]
            : Array.from(byParent.entries());

    for (const [, siblings] of entries) {
        if (siblings.length === 0) continue;

        const origin = computeOrigin(siblings);
        const rows = assignToRows(siblings, rectsById, {
            gapY: opts.gapY,
            rowOverlapThreshold: opts.rowOverlapThreshold,
        });
        const { colIndexById } = assignToColumns(rows, rectsById, {
            gapX: opts.gapX,
            colOverlapThreshold: opts.colOverlapThreshold,
        });

        const maxCols = Math.max(
            0,
            ...Array.from(colIndexById.values()).map((v) => v + 1)
        );

        const colWidths = new Array<number>(maxCols).fill(0);
        const rowHeights = new Array<number>(rows.length).fill(0);

        for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            for (const id of row.ids) {
                const c = colIndexById.get(id) ?? 0;
                const node = nodes.find((n) => n.id === id)!;
                const size = getNodeSize(node, nodes);
                colWidths[c] = Math.max(colWidths[c], size.width);
                rowHeights[r] = Math.max(rowHeights[r], size.height);
            }
        }

        const colX: number[] = [];
        let xCursor = origin.x;
        for (let c = 0; c < colWidths.length; c++) {
            colX[c] = xCursor;
            xCursor += colWidths[c] + opts.gapX;
        }

        const rowY: number[] = [];
        let yCursor = origin.y;
        for (let r = 0; r < rowHeights.length; r++) {
            rowY[r] = yCursor;
            yCursor += rowHeights[r] + opts.gapY;
        }

        const occupied: RectLike[] = [];

        for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            for (const id of row.ids) {
                const c = colIndexById.get(id) ?? 0;
                const node = nodes.find((n) => n.id === id)!;
                const size = getNodeSize(node, nodes);

                const cellW = colWidths[c];
                const cellH = rowHeights[r];

                const baseX = colX[c];
                const baseY = rowY[r];

                const pos: Point = {
                    x: opts.centerInCell ? baseX + Math.max(0, (cellW - size.width) / 2) : baseX,
                    y: opts.centerInCell ? baseY + Math.max(0, (cellH - size.height) / 2) : baseY,
                };

                const rect: RectLike = { x: pos.x, y: pos.y, width: size.width, height: size.height };
                const has = occupied.some((o) => overlaps(rect, o));
                if (has) {
                    // Very rare, but if centering causes overlaps (e.g. weird sizes), nudge down by grid gap.
                    let ny = pos.y;
                    while (occupied.some((o) => overlaps({ ...rect, y: ny }, o))) {
                        ny += opts.gapY;
                    }
                    nextPosById.set(id, { x: pos.x, y: ny });
                    occupied.push({ ...rect, y: ny });
                } else {
                    nextPosById.set(id, pos);
                    occupied.push(rect);
                }
            }
        }
    }

    let changed = false;
    const next = nodes.map((n) => {
        const pos = nextPosById.get(n.id);
        if (!pos) return n;
        if (pos.x === n.position.x && pos.y === n.position.y) return n;
        changed = true;
        return { ...n, position: pos };
    });

    return changed ? next : nodes;
}

/**
 * Helpers below are kept for potential future improvements.
 */
export type { RelayoutGridOptions };
