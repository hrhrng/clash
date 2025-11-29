export type CommandType = 'ADD_NODE' | 'ADD_EDGE' | 'UPDATE_NODE' | 'DELETE_NODE';

export interface Command {
    type: CommandType;
    payload: any;
}

export interface AIGCResponse {
    text: string;
    commands: Command[];
}

/**
 * Call Google AI through Vercel AI Gateway
 * This provides better performance, caching, and error handling
 */
async function callAIGateway(
    model: 'nanoBanana' | 'veo3' | 'gemini3' | 'gemini2Flash',
    prompt: string,
    stream: boolean = false
): Promise<string> {
    const response = await fetch('/api/google-ai', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            prompt,
            stream,
            temperature: 0.7,
            maxTokens: 2048,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`AI Gateway error: ${error.error || 'Unknown error'}`);
    }

    const data = await response.json();
    return data.text;
}

/**
 * Call Google AI with streaming support
 * Use this for better UX with real-time responses
 */
async function* callAIGatewayStream(
    model: 'nanoBanana' | 'veo3' | 'gemini3' | 'gemini2Flash',
    prompt: string
): AsyncGenerator<string, void, unknown> {
    const response = await fetch('/api/google-ai', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            prompt,
            stream: true,
            temperature: 0.7,
            maxTokens: 2048,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`AI Gateway error: ${error.error || 'Unknown error'}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield decoder.decode(value, { stream: true });
    }
}

export class GoogleAIGC {
    /**
     * Generate an image using Nano Banana Pro through Vercel AI Gateway
     *
     * @param prompt - The image generation prompt
     * @param stream - Whether to use streaming (optional, for better UX)
     */
    async generateImage(prompt: string, stream: boolean = false): Promise<AIGCResponse> {
        const systemPrompt = `
You are Nano Banana Pro, an advanced AI image generator.
The user wants to generate an image based on: "${prompt}".

Since you are an API, return a JSON object:
{
    "text": "I've generated an image of [description] using Nano Banana Pro.",
    "commands": [
        {
            "type": "ADD_NODE",
            "payload": {
                "type": "default",
                "data": { "label": "Generated Image", "mediaType": "image" },
                "position": { "x": 100, "y": 100 }
            }
        }
    ]
}
Output ONLY valid JSON.
        `;

        let responseText: string;

        try {
            responseText = await callAIGateway('nanoBanana', systemPrompt, stream);
        } catch (e) {
            console.warn('Nano Banana Pro failed, falling back to Gemini 2 Flash');
            responseText = await callAIGateway('gemini2Flash', systemPrompt, stream);
        }

        return this.parseResponse(responseText, 'Image generation failed.');
    }

    /**
     * Generate a video using Veo 3.1 through Vercel AI Gateway
     *
     * @param prompt - The video generation prompt
     * @param stream - Whether to use streaming (optional, for better UX)
     */
    async generateVideo(prompt: string, stream: boolean = false): Promise<AIGCResponse> {
        const systemPrompt = `
You are Veo 3.1, an advanced AI video generator.
The user wants to generate a video based on: "${prompt}".

Since you are an API, return a JSON object:
{
    "text": "I've generated a video of [description] using Veo 3.1.",
    "commands": [
        {
            "type": "ADD_NODE",
            "payload": {
                "type": "default",
                "data": { "label": "Generated Video", "mediaType": "video" },
                "position": { "x": 100, "y": 100 }
            }
        }
    ]
}
Output ONLY valid JSON.
        `;

        let responseText: string;

        try {
            responseText = await callAIGateway('veo3', systemPrompt, stream);
        } catch (e) {
            console.warn('Veo 3 failed, falling back to Gemini 2 Flash');
            responseText = await callAIGateway('gemini2Flash', systemPrompt, stream);
        }

        return this.parseResponse(responseText, 'Video generation failed.');
    }

    /**
     * Generate with streaming for real-time responses
     * Returns an async generator for incremental updates
     */
    async *generateImageStream(prompt: string): AsyncGenerator<string, AIGCResponse, unknown> {
        const systemPrompt = `
You are Nano Banana Pro, an advanced AI image generator.
The user wants to generate an image based on: "${prompt}".

Since you are an API, return a JSON object:
{
    "text": "I've generated an image of [description] using Nano Banana Pro.",
    "commands": [
        {
            "type": "ADD_NODE",
            "payload": {
                "type": "default",
                "data": { "label": "Generated Image", "mediaType": "image" },
                "position": { "x": 100, "y": 100 }
            }
        }
    ]
}
Output ONLY valid JSON.
        `;

        let fullText = '';
        for await (const chunk of callAIGatewayStream('nanoBanana', systemPrompt)) {
            fullText += chunk;
            yield chunk;
        }

        return this.parseResponse(fullText, 'Image generation failed.');
    }

    private parseResponse(text: string, fallbackText: string): AIGCResponse {
        const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
        try {
            const parsed = JSON.parse(cleanJson);
            return {
                text: parsed.text || fallbackText,
                commands: parsed.commands || [],
            };
        } catch (e) {
            console.error('JSON Parse Error', e);
            return { text: fallbackText, commands: [] };
        }
    }
}
