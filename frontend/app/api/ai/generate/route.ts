import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

export const runtime = 'edge';

/**
 * Vercel Function Proxy for Google AI
 *
 * POST /api/ai/generate
 *
 * Body:
 * {
 *   "model": "gemini-2.0-flash-exp" | "gemini-1.5-pro" | "gemini-1.5-flash",
 *   "prompt": "Your prompt here",
 *   "messages": [...], // optional, use either prompt or messages
 *   "image": "base64string", // optional, for image analysis
 *   "temperature": 0.7, // optional
 *   "maxTokens": 2048 // optional
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      model = 'gemini-2.0-flash-exp',
      prompt,
      messages,
      image,
      temperature = 0.7,
      maxTokens = 2048,
    } = body;

    // Validate input
    if (!prompt && !messages) {
      return NextResponse.json(
        { error: 'Either prompt or messages is required' },
        { status: 400 }
      );
    }

    // Build messages array
    let formattedMessages;

    if (messages) {
      formattedMessages = messages;
    } else if (image) {
      // Image + text prompt
      formattedMessages = [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: image,
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ];
    } else {
      // Simple text prompt
      formattedMessages = [
        {
          role: 'user',
          content: prompt,
        },
      ];
    }

    // Call Google AI via Vercel AI SDK
    const result = await generateText({
      model: google(model),
      messages: formattedMessages,
      temperature,
      maxTokens,
    });

    return NextResponse.json({
      success: true,
      text: result.text,
      usage: result.usage,
      finishReason: result.finishReason,
    });
  } catch (error) {
    console.error('AI proxy error:', error);

    if (error instanceof Error) {
      // Handle specific errors
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

      return NextResponse.json(
        {
          error: 'Failed to generate response',
          message: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'Google AI Proxy',
    timestamp: new Date().toISOString(),
    models: [
      'gemini-2.0-flash-exp',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-3-pro-preview',
    ],
  });
}
