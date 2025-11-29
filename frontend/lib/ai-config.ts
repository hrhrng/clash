import { createGoogleGenerativeAI } from '@ai-sdk/google';

/**
 * Configure Google AI with Vercel AI Gateway
 *
 * Vercel AI Gateway provides:
 * - Automatic caching
 * - Rate limiting
 * - Request/response logging
 * - Better error handling
 * - Optimized routing
 */

// Get configuration from environment
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const AI_GATEWAY_URL = process.env.AI_GATEWAY_URL; // Optional: custom gateway URL

// Create Google AI provider with gateway support
export const google = createGoogleGenerativeAI({
    apiKey: GOOGLE_API_KEY,
    // If using custom AI Gateway endpoint
    ...(AI_GATEWAY_URL && { baseURL: AI_GATEWAY_URL }),
});

// Model configurations
export const AI_MODELS = {
    // Nano Banana Pro for image generation
    nanoBanana: 'models/nano-banana-pro-001',

    // Veo 3.1 for video generation
    veo3: 'models/veo-3.1-preview-001',

    // Gemini models (fallback)
    gemini3: 'models/gemini-2.0-flash-exp',
    gemini2Flash: 'models/gemini-2.0-flash-exp',
} as const;

// Helper to get model instance
export function getModel(modelName: keyof typeof AI_MODELS) {
    return google(AI_MODELS[modelName]);
}
