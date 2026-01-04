import type { Node } from 'reactflow';
import type { Rect, Point, ResolutionStep, ResolutionResult, CollisionInfo } from '../types';
import { getAbsoluteRect, getAbsolutePosition, rectOverlaps } from '../core/geometry';
import { Mesh } from '../core/mesh';
import { detectCollisionsForNode, detectAllCollisions } from './detector';
import { getSiblings } from '../group/hierarchy';

interface ResolverOptions {
    maxIterations?: number;
    padding?: number;
    preferHorizontal?: boolean;
}

const DEFAULT_OPTIONS: Required<ResolverOptions> = {
    maxIterations: 10,
    padding: 20,
    preferHorizontal: true,
};

/**
 * Resolve collisions for a single node, pushing it to a non-overlapping position
 */
function resolveNodeCollision(
    nodeId: string,
    workingPositions: Map<string, Point>,
    nodes: Node[],
    mesh: Mesh,
    options: Required<ResolverOptions>
): ResolutionStep | null {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;

    // Get current position (from working positions or original)
    const currentPos = workingPositions.get(nodeId) || node.position;
    const nodeSize = getAbsoluteRect(node, nodes);

    // Get siblings to check for collisions
    const siblings = getSiblings(nodeId, nodes);

    // Build list of occupied rects (siblings' current positions)
    const occupiedRects: Rect[] = siblings
        .filter((s) => s.id !== nodeId)
        .map((s) => {
            const sibPos = workingPositions.get(s.id) || s.position;
            const sibRect = getAbsoluteRect(s, nodes);
            // Adjust rect to use working position
            const parentAbsPos = node.parentId
                ? getAbsolutePosition(nodes.find((n) => n.id === node.parentId)!, nodes)
                : { x: 0, y: 0 };
            return {
                x: parentAbsPos.x + sibPos.x,
                y: parentAbsPos.y + sibPos.y,
                width: sibRect.width,
                height: sibRect.height,
            };
        });

    // Calculate absolute position of current node
    const parentAbsPos = node.parentId
        ? getAbsolutePosition(nodes.find((n) => n.id === node.parentId)!, nodes)
        : { x: 0, y: 0 };

    const currentAbsPos = {
        x: parentAbsPos.x + currentPos.x,
        y: parentAbsPos.y + currentPos.y,
    };

    const currentRect: Rect = {
        ...currentAbsPos,
        width: nodeSize.width,
        height: nodeSize.height,
    };

    // Check if current position has collision
    const hasCollision = occupiedRects.some((occ) => rectOverlaps(currentRect, occ));
    if (!hasCollision) return null;

    // Find new position using mesh
    const newAbsPos = mesh.findNonOverlappingPosition(
        currentAbsPos,
        { width: nodeSize.width, height: nodeSize.height },
        occupiedRects
    );

    // Convert back to relative position
    const newRelPos = {
        x: newAbsPos.x - parentAbsPos.x,
        y: newAbsPos.y - parentAbsPos.y,
    };

    return {
        nodeId,
        newPosition: newRelPos,
        causedBy: 'collision',
    };
}

/**
 * Resolve all collisions with chain reaction support
 *
 * Algorithm:
 * 1. Detect initial collisions
 * 2. For each collision, push the "pushed" node to a new position
 * 3. Detect new collisions caused by the push (chain reaction)
 * 4. Repeat until no collisions or max iterations reached
 */
export function resolveCollisions(
    nodes: Node[],
    triggerNodeId: string,
    mesh: Mesh,
    options: ResolverOptions = {}
): ResolutionResult {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const steps: ResolutionStep[] = [];
    const workingPositions = new Map<string, Point>();

    // Initialize working positions from current node positions
    for (const node of nodes) {
        workingPositions.set(node.id, { ...node.position });
    }

    // Track which nodes have been processed to avoid infinite loops
    const processedInIteration = new Set<string>();
    let iterations = 0;
    let converged = false;

    // Start with the trigger node's siblings
    let nodesToCheck = new Set<string>([triggerNodeId]);

    while (iterations < opts.maxIterations && nodesToCheck.size > 0) {
        iterations++;
        processedInIteration.clear();

        const nextNodesToCheck = new Set<string>();

        for (const nodeId of nodesToCheck) {
            if (processedInIteration.has(nodeId)) continue;
            processedInIteration.add(nodeId);

            // Build a temporary nodes array with working positions
            const tempNodes = nodes.map((n) => {
                const pos = workingPositions.get(n.id);
                return pos ? { ...n, position: pos } : n;
            });

            // Detect collisions for this node
            const collisions = detectCollisionsForNode(nodeId, tempNodes);

            for (const collision of collisions) {
                // Determine which node to push (the other one, not the trigger)
                const pushedNodeId = collision.nodeA === nodeId ? collision.nodeB : collision.nodeA;

                // Skip if already processed
                if (processedInIteration.has(pushedNodeId)) continue;

                // Resolve collision for the pushed node
                const step = resolveNodeCollision(pushedNodeId, workingPositions, tempNodes, mesh, opts);

                if (step) {
                    steps.push({
                        ...step,
                        causedBy: nodeId,
                    });
                    workingPositions.set(pushedNodeId, step.newPosition);

                    // Add pushed node to check for chain reactions
                    nextNodesToCheck.add(pushedNodeId);
                }
            }
        }

        nodesToCheck = nextNodesToCheck;

        // Check if we've converged (no more nodes to check)
        if (nodesToCheck.size === 0) {
            converged = true;
        }
    }

    return {
        steps,
        iterations,
        converged,
    };
}

/**
 * Apply resolution steps to a nodes array
 */
export function applyResolution(nodes: Node[], result: ResolutionResult): Node[] {
    if (result.steps.length === 0) return nodes;

    const positionUpdates = new Map<string, Point>();
    for (const step of result.steps) {
        positionUpdates.set(step.nodeId, step.newPosition);
    }

    return nodes.map((node) => {
        const newPos = positionUpdates.get(node.id);
        if (newPos) {
            return { ...node, position: newPos };
        }
        return node;
    });
}

/**
 * Resolve collisions caused by a node expansion (size increase)
 */
export function resolveExpansionCollisions(
    expandedNodeId: string,
    nodes: Node[],
    mesh: Mesh,
    options: ResolverOptions = {}
): ResolutionResult {
    // The expanded node stays in place, but may cause collisions with siblings
    return resolveCollisions(nodes, expandedNodeId, mesh, options);
}

/**
 * Push a single node to avoid collision with an obstacle
 * Returns the new position for the pushed node
 */
export function pushNodeAway(
    pushedNode: Node,
    obstacleRect: Rect,
    nodes: Node[],
    mesh: Mesh
): Point {
    const pushedRect = getAbsoluteRect(pushedNode, nodes);
    const pushVector = mesh.calculatePushVector(pushedRect, obstacleRect);

    // Get parent offset for relative position calculation
    const parentAbsPos = pushedNode.parentId
        ? getAbsolutePosition(nodes.find((n) => n.id === pushedNode.parentId)!, nodes)
        : { x: 0, y: 0 };

    const newAbsPos = {
        x: pushedRect.x + pushVector.dx,
        y: pushedRect.y + pushVector.dy,
    };

    // Snap to grid
    const snappedAbsPos = mesh.snapToGrid(newAbsPos);

    // Convert to relative position
    return {
        x: snappedAbsPos.x - parentAbsPos.x,
        y: snappedAbsPos.y - parentAbsPos.y,
    };
}

/**
 * Simple collision resolution that just pushes nodes horizontally first
 */
export function simpleResolve(
    nodes: Node[],
    changedNodeId: string,
    mesh: Mesh
): Node[] {
    const result = resolveCollisions(nodes, changedNodeId, mesh);
    return applyResolution(nodes, result);
}
