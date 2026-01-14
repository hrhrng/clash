import type { Node } from 'reactflow';

// Basic geometry types
export interface Point {
    x: number;
    y: number;
}

export interface Size {
    width: number;
    height: number;
}

export interface Rect extends Point, Size {}

export interface NodeRect extends Rect {
    id: string;
    type?: string;
    parentId?: string;
    zIndex?: number;
}

// Mesh configuration
export interface MeshConfig {
    cellWidth: number;
    cellHeight: number;
    maxColumns: number;
    padding: number;
}

export interface MeshCell {
    row: number;
    col: number;
}

// Group ownership
export interface OwnershipResult {
    newParentId: string | undefined;
    relativePosition: Point;
}

// Collision types
export interface CollisionInfo {
    nodeA: string;
    nodeB: string;
    overlapRect: Rect;
    overlapArea: number;
    pushDirection: 'right' | 'down' | 'left' | 'up';
    pushDistance: number;
}

export interface ResolutionStep {
    nodeId: string;
    newPosition: Point;
    newSize?: Size;
    causedBy: string;
}

export interface ResolutionResult {
    steps: ResolutionStep[];
    iterations: number;
    converged: boolean;
}

// Scale types
export interface ScaleResult {
    newSize: Size;
    needsCollisionResolution: boolean;
    affectedRect: Rect;
}

// Layout manager config
export interface LayoutManagerConfig {
    mesh: Partial<MeshConfig>;
    autoScale: boolean;
    autoResolveCollisions: boolean;
    maxChainReactionIterations: number;
    /**
     * Optional callback invoked inside layout operations that mutate nodes.
     * Useful for syncing derived layout changes (e.g. group resize/collision resolution)
     * to an external persistence layer.
     */
    onNodesMutated?: (prevNodes: Node[], nextNodes: Node[]) => void;
}

// Re-export Node type for convenience
export type { Node };
