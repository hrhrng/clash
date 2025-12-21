/**
 * @clash/shared-types
 * 
 * Shared type definitions for Master Clash.
 * Types are defined as Zod schemas for runtime validation and TypeScript types.
 */

// Canvas types
export {
  PositionSchema,
  NodeStatusSchema,
  NodeDataSchema,
  CanvasNodeSchema,
  CanvasEdgeSchema,
  LoroDocumentStateSchema,
  type Position,
  type NodeStatus,
  type NodeData,
  type CanvasNode,
  type CanvasEdge,
  type LoroDocumentState,
} from './canvas';

// Task types
export {
  TaskTypeSchema,
  TaskStatusSchema,
  ExternalServiceSchema,
  AIGCTaskSchema,
  SubmitTaskRequestSchema,
  SubmitTaskResponseSchema,
  type TaskType,
  type TaskStatus,
  type ExternalService,
  type AIGCTask,
  type SubmitTaskRequest,
  type SubmitTaskResponse,
} from './tasks';
