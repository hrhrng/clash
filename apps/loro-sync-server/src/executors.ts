/**
 * Task Executor abstraction layer
 *
 * This module implements dependency inversion for AIGC task execution,
 * supporting three completion mechanisms:
 * 1. Synchronous (immediate execution)
 * 2. Webhook callback (external service notifies us)
 * 3. Polling (we query external service periodically)
 */

import type { AIGCTask, TaskType, ExternalService } from './types';

/**
 * Result of task execution attempt
 */
import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';

/**
 * Result of task execution attempt
 */
export interface ExecutionResult {
  // Whether the task has completed (success or failure)
  completed: boolean;

  // External task ID from the service (for polling/webhook tracking)
  external_task_id?: string;

  // External service name
  external_service?: ExternalService;

  // Result URL (e.g., video/image URL)
  result_url?: string;

  // Additional result data
  result_data?: Record<string, any>;

  // Error message if failed
  error?: string;

  // Optional description of the generated asset
  description?: string;
}

/**
 * Abstract base interface for task executors
 * Each AIGC service implements this interface
 */
export interface TaskExecutor {
  /**
   * Submit a task to the external service
   * Returns execution result which may be:
   * - Immediate (sync): completed=true with result_url
   * - Deferred (async): completed=false with external_task_id for tracking
   */
  submit(params: Record<string, any>): Promise<ExecutionResult>;

  /**
   * Poll task status from external service
   * Used by cron trigger for async tasks
   */
  poll(externalTaskId: string): Promise<ExecutionResult>;

  /**
   * Process webhook callback from external service
   * Returns standardized execution result
   */
  processWebhook(payload: any): Promise<ExecutionResult>;

  /**
   * Service name (e.g., 'kling', 'gemini')
   */
  getServiceName(): ExternalService;
}

/**
 * Kling AI video generation executor
 * Supports async execution with polling and webhook
 */
export class KlingExecutor implements TaskExecutor {
  private accessKey: string;
  private secretKey: string;

  constructor(accessKey?: string, secretKey?: string) {
    this.accessKey = accessKey || '';
    this.secretKey = secretKey || '';
  }

  getServiceName(): ExternalService {
    return 'kling';
  }

    async submit(params: Record<string, any>): Promise<ExecutionResult> {
    try {
      // In production, this would call actual Kling API
      const jwt = await this.generateJWT();
      
      // Use provided base64 or fallback to image_path (legacy)
      let imageBase64 = params.image_base64;
      
      if (!imageBase64 && params.image_path) {
          // Fallback legacy support
          console.log('[KlingExecutor] ⚠️ Using legacy image_path support');
          if (params.image_path.startsWith('http')) {
             // ... minimal fallback implementation or just error? 
             // Let's safe-keep the simple download for now but log warning
             try {
                const imgRes = await fetch(params.image_path);
                const buf = await imgRes.arrayBuffer();
                const bytes = new Uint8Array(buf);
                let binary = '';
                for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                imageBase64 = btoa(binary);
             } catch(e) { console.error('Fallback download failed', e); }
          } else {
             imageBase64 = params.image_path; 
          }
      }

      if (!imageBase64) {
          return { completed: true, error: "No image data provided (image_base64 required)" };
      }
      
      const requestBody = {
        model_name: params.model || 'kling-v1',
        image: imageBase64,
        prompt: params.prompt,
        duration: params.duration || 5,
        cfg_scale: params.cfg_scale || 0.5,
        negative_prompt: params.negative_prompt,
        mode: params.mode || 'std',
      };
      
      console.log('[KlingExecutor] Submitting request (image base64 length:', imageBase64.length, ')');
      
      const response = await fetch('https://api-beijing.klingai.com/v1/videos/image2video', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[KlingExecutor] API error ${response.status}: ${errorText}`);
        return {
          completed: true,
          error: `Kling API error: ${response.status} - ${errorText}`,
        };
      }

      const result = await response.json() as { code: number; message?: string; data?: { task_id: string } };

      if (result.code !== 0) {
        return {
          completed: true,
          error: `Kling API error: ${result.message}`,
        };
      }

      // Kling returns task_id for async processing
      return {
        completed: false,
        external_task_id: result.data?.task_id,
        external_service: 'kling',
      };
    } catch (error) {
      console.error('Kling submission error:', error);
      return {
        completed: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async poll(externalTaskId: string): Promise<ExecutionResult> {
    try {
      console.log(`[KlingExecutor] Polling task: ${externalTaskId}`);
      const jwt = await this.generateJWT();
      const response = await fetch(
        `https://api-beijing.klingai.com/v1/videos/image2video/${externalTaskId}`,
        {
          headers: {
            'Authorization': `Bearer ${jwt}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.error(`[KlingExecutor] Poll API error: ${response.status}`);
        return {
          completed: false,
          error: `Kling API error: ${response.status}`,
        };
      }

      const result = await response.json() as { 
        code: number; 
        message?: string; 
        data?: { 
          task_status: string; 
          task_status_msg?: string;
          task_result?: { videos?: Array<{ url: string; duration: number }> };
        } 
      };
      
      console.log(`[KlingExecutor] Poll result: code=${result.code}, status=${result.data?.task_status}`);

      if (result.code !== 0) {
        console.error(`[KlingExecutor] Poll code error: ${result.message}`);
        return {
          completed: false,
          error: `Kling API error: ${result.message}`,
        };
      }

      const data = result.data;
      if (!data) {
        return { completed: false, error: 'No data in response' };
      }
      const taskStatus = data.task_status;

      if (taskStatus === 'succeed') {
        const videos = data.task_result?.videos || [];
        console.log(`[KlingExecutor] ✅ Task ${externalTaskId} succeeded! Video URL: ${videos[0]?.url}`);
        return {
          completed: true,
          result_url: videos[0]?.url,
          result_data: {
            duration: videos[0]?.duration,
            task_id: externalTaskId,
          },
        };
      } else if (taskStatus === 'failed') {
        return {
          completed: true,
          error: data.task_status_msg || 'Video generation failed',
        };
      }

      // Still processing
      return { completed: false };
    } catch (error) {
      console.error('Kling polling error:', error);
      return {
        completed: false,
        error: error instanceof Error ? error.message : 'Unknown polling error',
      };
    }
  }

  async processWebhook(payload: any): Promise<ExecutionResult> {
    // Process Kling webhook callback
    const taskStatus = payload.task_status;

    if (taskStatus === 'succeed') {
      const videos = payload.task_result?.videos || [];
      return {
        completed: true,
        result_url: videos[0]?.url,
        result_data: {
          duration: videos[0]?.duration,
          task_id: payload.task_id,
        },
      };
    } else if (taskStatus === 'failed') {
      return {
        completed: true,
        error: payload.task_status_msg || 'Video generation failed',
      };
    }

    return { completed: false };
  }

  private async generateJWT(): Promise<string> {
    // Generate JWT using HS256 algorithm
    // Format: header.payload.signature
    const now = Math.floor(Date.now() / 1000);
    
    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };
    
    const payload = {
      iss: this.accessKey,
      exp: now + 1800, // Valid for 30 minutes
      nbf: now - 5,    // Start valid 5 seconds ago
    };
    
    // Base64url encode
    const base64url = (str: string): string => {
      const base64 = btoa(str);
      return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    
    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(payload));
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    
    // Sign with HMAC-SHA256
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.secretKey);
    const messageData = encoder.encode(signatureInput);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const signatureArray = new Uint8Array(signatureBuffer);
    
    // Convert signature to base64url
    let binary = '';
    for (let i = 0; i < signatureArray.length; i++) {
      binary += String.fromCharCode(signatureArray[i]);
    }
    const signature = base64url(binary);
    
    return `${signatureInput}.${signature}`;
  }
}

/**
 * Gemini image generation executor using Vertex AI SDK
 * Supports synchronous execution (immediate results)
 */
export class GeminiExecutor implements TaskExecutor {
  private projectId: string;
  private location: string;
  private vertexAI: VertexAI;
  
  constructor(projectId?: string, location?: string, clientEmail?: string, privateKey?: string) {
    this.projectId = projectId || 'clash-of-ai'; 
    this.location = location || 'us-central1';
    
    // Explicitly provide credentials if available to bypass file-based GoogleAuth
    const vertexOptions: any = {
      project: this.projectId,
      location: this.location
    };

    if (clientEmail && privateKey) {
      // Fix newlines in private key if they were escaped
      const formattedKey = privateKey.replace(/\\n/g, '\n');
      
      vertexOptions.googleAuthOptions = {
        credentials: {
          client_email: clientEmail,
          private_key: formattedKey,
        }
      };
    }

    // Initialize Vertex AI client
    this.vertexAI = new VertexAI(vertexOptions);
  }

  getServiceName(): ExternalService {
    return 'gemini';
  }

  async submit(params: Record<string, any>): Promise<ExecutionResult> {
    try {
      // Use Gemini 2.5 Flash Image for image generation
      // Format: gemini-2.5-flash-image
      const modelName = 'gemini-2.5-flash-image';
      
      const generativeModel = this.vertexAI.getGenerativeModel({
        model: modelName,
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
        ],
        generationConfig: {
          maxOutputTokens: 2048,
          responseModalities: ['IMAGE', 'TEXT'] as any, // Cast to any if typing issue
        },
      });

      const prompt = params.text || params.prompt || '';
      const base64Images = params.base64_images || [];
      const referenceImageUrls = params.reference_image_urls || [];
      
      // 详细的入参日志
      console.log(`[GeminiExecutor] ========== INPUT PARAMETERS ==========`);
      console.log(`[GeminiExecutor] Prompt: "${prompt}"`);
      console.log(`[GeminiExecutor] Base64 images count: ${base64Images.length}`);
      if (base64Images.length > 0) {
        base64Images.forEach((img: string, idx: number) => {
          console.log(`[GeminiExecutor]   - base64_images[${idx}]: ${img ? `${img.length} chars` : 'empty'}`);
        });
      }
      console.log(`[GeminiExecutor] Reference image URLs count: ${referenceImageUrls.length}`);
      if (referenceImageUrls.length > 0) {
        referenceImageUrls.forEach((url: string, idx: number) => {
          console.log(`[GeminiExecutor]   - reference_image_urls[${idx}]: ${url ? url.substring(0, 100) + '...' : 'empty'}`);
        });
      }
      console.log(`[GeminiExecutor] Aspect ratio: ${params.aspect_ratio || 'not specified'}`);
      console.log(`[GeminiExecutor] System prompt: ${params.system_prompt ? `"${params.system_prompt.substring(0, 50)}..."` : 'not provided'}`);
      console.log(`[GeminiExecutor] ==========================================`);

      // Build parts array: start with text prompt
      const parts: any[] = [{ text: prompt }];
      
      // Add reference images if provided (已在上面声明base64Images和referenceImageUrls)
      console.log(`[GeminiExecutor] Processing ${base64Images.length} base64 images and ${referenceImageUrls.length} reference URLs`);
      
      // Add base64 images directly
      for (const base64Data of base64Images) {
        if (base64Data) {
          parts.push({
            inlineData: {
              mimeType: 'image/jpeg',  // Default to JPEG, could be enhanced to detect actual type
              data: base64Data
            }
          });
          console.log(`[GeminiExecutor] Added base64 image (${base64Data.length} chars)`);
        }
      }
      
      // Fetch and convert reference image URLs to base64
      for (const url of referenceImageUrls) {
        if (url) {
          try {
            console.log(`[GeminiExecutor] Fetching reference image from URL: ${url.substring(0, 100)}...`);
            const imageResponse = await fetch(url);
            if (!imageResponse.ok) {
              console.warn(`[GeminiExecutor] Failed to fetch reference image ${url}: ${imageResponse.status}`);
              continue;
            }
            const imageBuffer = await imageResponse.arrayBuffer();
            const bytes = new Uint8Array(imageBuffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);
            
            // Detect MIME type from response headers or default to JPEG
            const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
            
            parts.push({
              inlineData: {
                mimeType: contentType,
                data: base64
              }
            });
            console.log(`[GeminiExecutor] Added reference image from URL (${base64.length} chars, ${contentType})`);
          } catch (e) {
            console.error(`[GeminiExecutor] Failed to fetch reference image ${url}:`, e);
          }
        }
      }

      // Using SDK to generate content
      const req = {
        contents: [{ role: 'user', parts }],
        systemInstruction: {
            role: 'system',
            parts: [{"text": "You are an image generation backend. You do NOT chat. You do NOT explain. You ONLY generate the image requested by the user. If the user asks for an icon, generate an icon. If the user asks for a photo, generate a photo. Do not add extra details not found in the prompt."}]
        }
      };
      
      console.log(`[GeminiExecutor] Request with ${parts.length} parts (1 text + ${parts.length - 1} images)`);

      const result = await generativeModel.generateContent(req);
      const response = await result.response;
      
      const candidates = response.candidates;
      if (!candidates || candidates.length === 0) {
        return {
          completed: true,
          error: 'No candidates returned from Vertex AI',
        };
      }

      const responseParts = candidates[0].content?.parts || [];
      // Look for inline data (image)
      // Vertex AI SDK usually returns images as inline_data in parts
      const imagePart = responseParts.find((p: any) => p.inlineData && p.inlineData.mimeType.startsWith('image/'));

      if (!imagePart || !imagePart.inlineData) {
         // Check for text refusal/error
         const textPart = responseParts.find((p: any) => p.text);
         if (textPart) {
           return {
             completed: true,
             error: `Model returned text instead of image: ${textPart.text}`,
           };
         }
         return {
           completed: true,
           error: 'No image data found in Vertex AI response',
         };
      }

      // Return base64 image data
      return {
        completed: true,
        result_data: {
          base64: imagePart.inlineData.data,
          mimeType: imagePart.inlineData.mimeType,
          aspect_ratio: params.aspect_ratio,
        },
        external_service: 'gemini',
      };

    } catch (error) {
      console.error('Vertex AI submission error:', error);
      return {
        completed: true,
        error: error instanceof Error ? error.message : 'Unknown Vertex AI error',
      };
    }
  }

  async poll(externalTaskId: string): Promise<ExecutionResult> {
    // Gemini/Vertex is synchronous
    return {
      completed: true,
      error: 'Vertex AI tasks are synchronous - polling not supported',
    };
  }

  async processWebhook(payload: any): Promise<ExecutionResult> {
    // Gemini/Vertex doesn't use webhooks
    return {
      completed: true,
      error: 'Vertex AI tasks are synchronous - webhooks not supported',
    };
  }

  /**
   * Generate a description for an asset using Gemini vision capabilities via Vertex AI
   * @param assetUrl - URL or data URI of the asset
   * @param mimeType - MIME type of the asset
   * @param clientEmail - GCP service account client email
   * @param privateKey - GCP service account private key
   * @returns Promise resolving to description text, or null if generation fails
   */
  async generateDescription(
    assetUrl: string, 
    mimeType: string, 
    clientEmail?: string, 
    privateKey?: string
  ): Promise<string | null> {
    try {
      const { generateDescription: generateDescriptionUtil } = await import('./description');
      
      // Use provided credentials or return null
      if (!clientEmail || !privateKey) {
        console.error('[GeminiExecutor] No GCP credentials provided for description generation');
        return null;
      }
      
      // Format private key (handle escaped newlines)
      const formattedKey = privateKey.replace(/\\n/g, '\n');
      
      return await generateDescriptionUtil(
        this.projectId,
        this.location,
        {
          client_email: clientEmail,
          private_key: formattedKey,
        },
        assetUrl,
        mimeType
      );
    } catch (error) {
      console.error('[GeminiExecutor] Error generating description:', error);
      return null;
    }
  }
}

/**
 * Factory for creating task executors
 */
export class ExecutorFactory {
  private executors: Map<TaskType, TaskExecutor>;

  constructor() {
    this.executors = new Map();
  }

  /**
   * Register an executor for a task type
   */
  register(taskType: TaskType, executor: TaskExecutor): void {
    this.executors.set(taskType, executor);
  }

  /**
   * Get executor for a task type
   */
  getExecutor(taskType: TaskType): TaskExecutor | undefined {
    return this.executors.get(taskType);
  }

  /**
   * Get executor by service name (for webhook processing)
   */
  getExecutorByService(service: ExternalService): TaskExecutor | undefined {
    for (const executor of this.executors.values()) {
      if (executor.getServiceName() === service) {
        return executor;
      }
    }
    return undefined;
  }
}

/**
 * Create default executor factory with all registered executors
 */
export function createExecutorFactory(env?: { 
  KLING_ACCESS_KEY?: string; 
  KLING_SECRET_KEY?: string; 
  GEMINI_API_KEY?: string; 
  GEMINI_BASE_URL?: string;
  GCP_PROJECT_ID?: string;
  GCP_LOCATION?: string;
  GCP_CLIENT_EMAIL?: string;
  GCP_PRIVATE_KEY?: string;
}): ExecutorFactory {
  const factory = new ExecutorFactory();

  // Register Kling executor for video tasks
  const klingExecutor = new KlingExecutor(env?.KLING_ACCESS_KEY, env?.KLING_SECRET_KEY);
  factory.register('kling_video', klingExecutor);

  // Register Gemini executor (using Vertex AI SDK)
  // Requires GCP_PROJECT_ID and GCP_LOCATION for Vertex
  // Falls back to direct API key if project ID missing? 
  // Given user request, we enforce Vertex.
  const geminiExecutor = new GeminiExecutor(
    env?.GCP_PROJECT_ID, 
    env?.GCP_LOCATION,
    env?.GCP_CLIENT_EMAIL,
    env?.GCP_PRIVATE_KEY
  );
  
  // Register for both task types
  factory.register('nano_banana', geminiExecutor);
  factory.register('nano_banana_pro', geminiExecutor);

  return factory;
}
