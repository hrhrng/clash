import { NextRequest, NextResponse } from 'next/server';
import { streamText, generateText } from 'ai';
import { google, getModel } from '@/lib/ai-config';

/**
 * Vercel AI Gateway Endpoint for Google AI Studio
 *
 * Benefits over direct API calls:
 * 1. Built-in caching - reduces API costs and latency
 * 2. Automatic retries with exponential backoff
 * 3. Request/response logging and analytics
 * 4. Unified error handling
 * 5. Optimized routing through Vercel's edge network
 * 6. Rate limiting and quotas
 */

export const runtime = 'edge'; // Use edge runtime for better performance

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            model = 'gemini2Flash',
            prompt,
            messages,
            stream = false,
            temperature = 0.7,
        } = body;

        // Validate input
        if (!prompt && (!messages || messages.length === 0)) {
            return NextResponse.json(
                { error: 'Either prompt or messages is required' },
                { status: 400 }
            );
        }

        // Get model instance
        const modelInstance = getModel(model as keyof typeof import('@/lib/ai-config').AI_MODELS);

        // Prepare messages
        const formattedMessages = messages || [{ role: 'user', content: prompt }];

        // Stream response (recommended for better UX)
        if (stream) {
            const result = await streamText({
                model: modelInstance,
                messages: formattedMessages,
                temperature,
            });

            return result.toTextStreamResponse();
        }

        // Non-streaming response
        const result = await generateText({
            model: modelInstance,
            messages: formattedMessages,
            temperature,
        });

        return NextResponse.json({
            success: true,
            text: result.text,
            usage: result.usage,
            finishReason: result.finishReason,
        });
    } catch (error) {
        console.error('AI Gateway error:', error);

        // Handle specific error types
        if (error instanceof Error) {
            if (error.message.includes('API key')) {
                return NextResponse.json(
                    { error: 'Invalid or missing API key' },
                    { status: 401 }
                );
            }

            if (error.message.includes('quota')) {
                return NextResponse.json(
                    { error: 'API quota exceeded' },
                    { status: 429 }
                );
            }

            if (error.message.includes('model')) {
                return NextResponse.json(
                    { error: 'Invalid model specified' },
                    { status: 400 }
                );
            }
        }

        return NextResponse.json(
            {
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

// Health check endpoint
export async function GET() {
    return NextResponse.json({
        status: 'ok',
        service: 'Vercel AI Gateway - Google AI',
        timestamp: new Date().toISOString(),
        models: {
            nanoBanana: 'models/nano-banana-pro-001',
            veo3: 'models/veo-3.1-preview-001',
            gemini3: 'models/gemini-2.0-flash-exp',
            gemini2Flash: 'models/gemini-2.0-flash-exp',
        },
    });
}
