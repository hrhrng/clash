# ALWAYS And MUST do
1. after a task, run cicd for compile、lint and other check.（do not build because this project is hot-built） which maintain in Makefile

# Shared Configuration Pattern

## Model Configuration (Image/Video Generation)

**Location**: `packages/shared-types/src/models.ts`

All model-related configurations (MODEL_CARDS, aspect ratios, image sizes, parameters) are centralized in the shared-types package to maintain consistency across frontend and backend.

### Key Principles:

1. **Single Source of Truth**: Model configurations, aspect ratios, and parameters are defined once in `shared-types`
2. **TypeScript → Python Sync**: Python backend should reference these configurations in comments and validate against them
3. **Configuration Constants**: Use exported constants like `GEMINI_ASPECT_RATIOS` and `GEMINI_IMAGE_SIZES` instead of hardcoding values

### Example:

```typescript
// packages/shared-types/src/models.ts
export const GEMINI_ASPECT_RATIOS = [
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  // ...
] as const;

export const MODEL_CARDS: ModelCard[] = [
  {
    id: 'nano-banana-pro',
    parameters: [
      {
        id: 'aspect_ratio',
        options: GEMINI_ASPECT_RATIOS.map(r => ({ label: r.label, value: r.value })),
      },
    ],
  },
];
```

```python
# apps/api/src/master_clash/tools/nano_banana.py
# Gemini supported aspect ratios (synced with shared-types GEMINI_ASPECT_RATIOS)
supported_aspect_ratios = {
    "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"
}
```

### Benefits:
- Frontend UI automatically reflects available options
- Backend validation uses the same constraints
- Easy to add new models or parameters in one place
- Type safety across the stack

# Multi-Provider Architecture

## Provider System for Models

Models can have multiple provider implementations (e.g., ElevenLabs via official API or KIE.ai).

### Configuration

**Location**: `packages/shared-types/src/models.ts`

```typescript
export const ProviderSchema = z.enum(['official', 'kie']);

export const ModelCardSchema = z.object({
  // ... existing fields
  availableProviders: z.array(ProviderSchema).optional(),
  defaultProvider: ProviderSchema.optional(),
});
```

### Implementation Pattern

1. **Model Card Configuration**: Specify available providers in MODEL_CARDS
   ```typescript
   {
     id: 'elevenlabs-tts',
     availableProviders: ['official', 'kie'],
     defaultProvider: 'official',
   }
   ```

2. **Backend Provider Services**: Create separate service files for each provider
   - `elevenlabs_tts.py` - Official ElevenLabs API
   - `kie_elevenlabs_tts.py` - KIE.ai proxy for ElevenLabs

3. **Generation Router**: Route requests to appropriate provider in `generation_models.py`
   ```python
   async def _run_elevenlabs_tts(request, provider="official"):
       if provider == "kie":
           result = await kie_elevenlabs_tts.generate_speech(...)
       else:
           result = await elevenlabs_tts.generate_speech(...)
   ```

4. **Request Flow**: Provider can be specified via:
   - `AudioGenerationRequest.provider` field
   - `params['provider']` parameter
   - Defaults to model's `defaultProvider`

### Benefits

- **Flexibility**: Switch providers without changing model interface
- **Fallback**: Can implement automatic fallback to alternative providers
- **Cost Optimization**: Route to cheaper providers when available
- **Geographic Routing**: Use regional providers for lower latency
- **A/B Testing**: Compare quality across providers

### Adding New Providers

1. Create new provider enum value in shared-types
2. Implement provider service in `apps/api/src/master_clash/services/`
3. Add routing logic in `generation_models.py`
4. Update model card's `availableProviders` array
5. Document provider-specific configuration

# for backend
1. domain design driven
2. Functional programming
    1. more protocal and ADT, less class
    2. more pattern match
3. go async or go die
