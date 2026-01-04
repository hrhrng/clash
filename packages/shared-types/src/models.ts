import { z } from 'zod';

export const ModelKindSchema = z.enum(['image', 'video']);
export type ModelKind = z.infer<typeof ModelKindSchema>;

export const ModelParameterTypeSchema = z.enum(['select', 'slider', 'number', 'text', 'boolean']);
export type ModelParameterType = z.infer<typeof ModelParameterTypeSchema>;

export const ModelParameterSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: ModelParameterTypeSchema,
  description: z.string().optional(),
  required: z.boolean().default(false),
  options: z
    .array(
      z.object({
        label: z.string(),
        value: z.union([z.string(), z.number()]),
      })
    )
    .optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  placeholder: z.string().optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
});
export type ModelParameter = z.infer<typeof ModelParameterSchema>;

export const ModelInputRuleSchema = z.object({
  requiresPrompt: z.boolean().default(true),
  referenceImage: z.enum(['required', 'optional', 'forbidden']).default('optional'),
  referenceMode: z.enum(['none', 'single', 'multi', 'start_end']).default('single'),
});
export type ModelInputRule = z.infer<typeof ModelInputRuleSchema>;

export const ModelCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  kind: ModelKindSchema,
  description: z.string().optional(),
  parameters: z.array(ModelParameterSchema),
  defaultParams: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
  input: ModelInputRuleSchema.default({ requiresPrompt: true, referenceImage: 'optional' }),
});
export type ModelCard = z.infer<typeof ModelCardSchema>;

export const MODEL_CARDS: ModelCard[] = [
  {
    id: 'nano-banana',
    name: 'Nano Banana',
    provider: 'Google Gemini',
    kind: 'image',
    description: 'Gemini 2.5 Flash image generation tuned for fast drafts.',
    parameters: [
      {
        id: 'aspect_ratio',
        label: 'Aspect Ratio',
        type: 'select',
        options: [
          { label: '1:1', value: '1:1' },
          { label: '3:4', value: '3:4' },
          { label: '4:3', value: '4:3' },
          { label: '9:16', value: '9:16' },
          { label: '16:9', value: '16:9' },
        ],
        defaultValue: '16:9',
      },
      {
        id: 'stylization',
        label: 'Stylization',
        type: 'slider',
        min: 0,
        max: 1000,
        step: 10,
        defaultValue: 100,
        description: 'Higher values add more model-driven styling.',
      },
      {
        id: 'weirdness',
        label: 'Weirdness',
        type: 'slider',
        min: 0,
        max: 1000,
        step: 10,
        defaultValue: 0,
        description: 'Experimentation strength for unexpected details.',
      },
      {
        id: 'diversity',
        label: 'Diversity',
        type: 'slider',
        min: 0,
        max: 1000,
        step: 10,
        defaultValue: 0,
        description: 'Encourage variety across multiple renders.',
      },
      {
        id: 'count',
        label: 'Count',
        type: 'number',
        min: 1,
        max: 8,
        step: 1,
        defaultValue: 1,
        description: 'How many candidates to request in one call.',
      },
    ],
    defaultParams: {
      aspect_ratio: '16:9',
      stylization: 100,
      weirdness: 0,
      diversity: 0,
      count: 1,
    },
    input: { requiresPrompt: true, referenceImage: 'optional', referenceMode: 'single' },
  },
  {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    provider: 'Google Gemini',
    kind: 'image',
    description: 'Gemini 3.0 Pro Image Preview for higher fidelity generations.',
    parameters: [
      {
        id: 'aspect_ratio',
        label: 'Aspect Ratio',
        type: 'select',
        options: [
          { label: '1:1', value: '1:1' },
          { label: '3:4', value: '3:4' },
          { label: '4:3', value: '4:3' },
          { label: '9:16', value: '9:16' },
          { label: '16:9', value: '16:9' },
        ],
        defaultValue: '16:9',
      },
      {
        id: 'stylization',
        label: 'Stylization',
        type: 'slider',
        min: 0,
        max: 1000,
        step: 10,
        defaultValue: 200,
      },
      {
        id: 'weirdness',
        label: 'Weirdness',
        type: 'slider',
        min: 0,
        max: 1000,
        step: 10,
        defaultValue: 0,
      },
      {
        id: 'count',
        label: 'Count',
        type: 'number',
        min: 1,
        max: 8,
        step: 1,
        defaultValue: 1,
        description: 'How many candidates to request in one call.',
      },
    ],
    defaultParams: {
      aspect_ratio: '16:9',
      stylization: 200,
      weirdness: 0,
      count: 1,
    },
    input: { requiresPrompt: true, referenceImage: 'optional', referenceMode: 'single' },
  },
  {
    id: 'kling-image2video',
    name: 'Kling Image2Video',
    provider: 'Kling (Beijing)',
    kind: 'video',
    description: 'Turn a single keyframe into a short cinematic clip.',
    parameters: [
      {
        id: 'duration',
        label: 'Duration',
        type: 'select',
        options: [
          { label: '5s', value: 5 },
          { label: '10s', value: 10 },
        ],
        defaultValue: 5,
      },
      {
        id: 'cfg_scale',
        label: 'CFG',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.5,
        description: 'Higher values adhere more tightly to the prompt.',
      },
    ],
    defaultParams: {
      duration: 5,
      cfg_scale: 0.5,
    },
    input: { requiresPrompt: true, referenceImage: 'required', referenceMode: 'single' },
  },
  {
    id: 'kling-kie-text2video',
    name: 'Kling Text2Video Pro',
    provider: 'Kling AI (KIE)',
    kind: 'video',
    description: 'Direct text-to-video generation via Kling KIE API.',
    parameters: [
      {
        id: 'duration',
        label: 'Duration',
        type: 'select',
        options: [
          { label: '5s', value: '5' },
          { label: '10s', value: '10' },
        ],
        defaultValue: '5',
      },
      {
        id: 'aspect_ratio',
        label: 'Aspect Ratio',
        type: 'select',
        options: [
          { label: '16:9', value: '16:9' },
          { label: '9:16', value: '9:16' },
          { label: '1:1', value: '1:1' },
        ],
        defaultValue: '16:9',
      },
      {
        id: 'negative_prompt',
        label: 'Negative Prompt',
        type: 'text',
        placeholder: 'blur, distort, low quality',
        defaultValue: 'blur, distort, low quality',
      },
      {
        id: 'cfg_scale',
        label: 'CFG',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.5,
      },
    ],
    defaultParams: {
      duration: '5',
      aspect_ratio: '16:9',
      negative_prompt: 'blur, distort, low quality',
      cfg_scale: 0.5,
    },
    input: { requiresPrompt: true, referenceImage: 'forbidden', referenceMode: 'none' },
  },
  {
    id: 'kling-kie-image2video',
    name: 'Kling Image2Video Pro',
    provider: 'Kling AI (KIE)',
    kind: 'video',
    description: 'Animate a still image with Kling KIE image-to-video.',
    parameters: [
      {
        id: 'duration',
        label: 'Duration',
        type: 'select',
        options: [
          { label: '5s', value: '5' },
          { label: '10s', value: '10' },
        ],
        defaultValue: '5',
      },
      {
        id: 'aspect_ratio',
        label: 'Aspect Ratio',
        type: 'select',
        options: [
          { label: '16:9', value: '16:9' },
          { label: '9:16', value: '9:16' },
          { label: '1:1', value: '1:1' },
        ],
        defaultValue: '16:9',
      },
      {
        id: 'negative_prompt',
        label: 'Negative Prompt',
        type: 'text',
        placeholder: 'blur, distort, low quality',
        defaultValue: 'blur, distort, low quality',
      },
      {
        id: 'cfg_scale',
        label: 'CFG',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.5,
      },
    ],
    defaultParams: {
      duration: '5',
      aspect_ratio: '16:9',
      negative_prompt: 'blur, distort, low quality',
      cfg_scale: 0.5,
    },
    input: { requiresPrompt: true, referenceImage: 'required', referenceMode: 'start_end' },
  },
] as unknown as ModelCard[];
