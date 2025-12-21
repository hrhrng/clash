/**
 * Generate JSON Schema from Zod schemas
 * 
 * This script generates JSON Schema files that can be used for:
 * - API validation
 * - Documentation
 * - Python type generation
 */

import * as fs from 'fs';
import * as path from 'path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  CanvasNodeSchema,
  CanvasEdgeSchema,
  AIGCTaskSchema,
  SubmitTaskRequestSchema,
  SubmitTaskResponseSchema,
} from '../src';

const OUTPUT_DIR = path.join(__dirname, '../dist/json-schema');

const schemas = {
  CanvasNode: CanvasNodeSchema,
  CanvasEdge: CanvasEdgeSchema,
  AIGCTask: AIGCTaskSchema,
  SubmitTaskRequest: SubmitTaskRequestSchema,
  SubmitTaskResponse: SubmitTaskResponseSchema,
};

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Generate JSON Schema for each Zod schema
for (const [name, schema] of Object.entries(schemas)) {
  const jsonSchema = zodToJsonSchema(schema, { name });
  const outputPath = path.join(OUTPUT_DIR, `${name}.json`);
  
  fs.writeFileSync(outputPath, JSON.stringify(jsonSchema, null, 2));
  console.log(`Generated: ${outputPath}`);
}

console.log('\n✅ JSON Schema generation complete');
