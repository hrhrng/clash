import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
import type { SyncExecutor, ExecutionResult, ExecutorOptions } from './types';
import { createLogger } from '../logger';

const logger = createLogger('GeminiExecutor');

/**
 * Gemini Image Generation Executor (Vertex AI)
 * Synchronous execution - returns result immediately
 */
export class GeminiExecutor implements SyncExecutor {
  readonly serviceName = 'gemini' as const;
  readonly completionMode = 'sync' as const;

  private projectId: string;
  private location: string;
  private vertexAI: VertexAI;

  constructor(options: ExecutorOptions) {
    this.projectId = options.projectId || 'clash-of-ai';
    this.location = options.location || 'us-central1';

    const vertexOptions: any = {
      project: this.projectId,
      location: this.location,
    };

    if (options.clientEmail && options.privateKey) {
      const formattedKey = options.privateKey.replace(/\\n/g, '\n');
      vertexOptions.googleAuthOptions = {
        credentials: {
          client_email: options.clientEmail,
          private_key: formattedKey,
        },
      };
    }

    this.vertexAI = new VertexAI(vertexOptions);
  }

  async execute(params: Record<string, unknown>): Promise<ExecutionResult> {
    try {
      const model = this.vertexAI.getGenerativeModel({
        model: 'gemini-2.5-flash-image',
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
        ],
        generationConfig: {
          maxOutputTokens: 2048,
          responseModalities: ['IMAGE', 'TEXT'],
        } as any,
      });

      const prompt = (params.text || params.prompt || '') as string;
      const referenceImageUrls = (params.reference_image_urls || []) as string[];
      const base64Images = (params.base64_images || []) as string[];

      logger.info('Starting image generation', {
        promptLength: prompt.length,
        referenceCount: referenceImageUrls.length + base64Images.length,
      });

      // Build parts array
      const parts: any[] = [{ text: prompt }];

      // Add base64 images
      for (const base64Data of base64Images) {
        if (base64Data) {
          parts.push({
            inlineData: { mimeType: 'image/jpeg', data: base64Data },
          });
        }
      }

      // Fetch and convert reference image URLs to base64
      for (const url of referenceImageUrls) {
        if (url) {
          try {
            const response = await fetch(url);
            if (response.ok) {
              const buffer = await response.arrayBuffer();
              const bytes = new Uint8Array(buffer);
              let binary = '';
              for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
              }
              const base64 = btoa(binary);
              const contentType = response.headers.get('content-type') || 'image/jpeg';
              parts.push({
                inlineData: { mimeType: contentType, data: base64 },
              });
            }
          } catch (e) {
            logger.warn('Failed to fetch reference image', { url: url.substring(0, 50) });
          }
        }
      }

      const result = await model.generateContent({
        contents: [{ role: 'user', parts }],
        systemInstruction: {
          role: 'system',
          parts: [{ text: 'You are an image generation backend. You do NOT chat. You ONLY generate the image requested by the user.' }],
        },
      });

      const response = await result.response;
      const candidates = response.candidates;

      if (!candidates || candidates.length === 0) {
        return { completed: true, error: 'No candidates returned from Vertex AI' };
      }

      const responseParts = candidates[0].content?.parts || [];
      const imagePart = responseParts.find((p: any) =>
        p.inlineData && p.inlineData.mimeType?.startsWith('image/')
      );

      if (!imagePart || !imagePart.inlineData) {
        const textPart = responseParts.find((p: any) => p.text);
        if (textPart) {
          return { completed: true, error: `Model returned text: ${textPart.text}` };
        }
        return { completed: true, error: 'No image data in response' };
      }

      logger.info('Image generation completed');

      return {
        completed: true,
        resultData: {
          base64: imagePart.inlineData.data,
          mimeType: imagePart.inlineData.mimeType,
          aspectRatio: params.aspect_ratio,
        },
        externalService: 'gemini',
      };
    } catch (error) {
      logger.error('Image generation failed', error as Error);
      return {
        completed: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
