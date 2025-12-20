import type { PollingExecutor, ExecutionResult, ExecutorOptions } from './types';
import { createLogger } from '../logger';

const logger = createLogger('KlingExecutor');

/**
 * Kling Video Generation Executor
 * Polling-based execution - submit task, then poll for result
 */
export class KlingExecutor implements PollingExecutor {
  readonly serviceName = 'kling' as const;
  readonly completionMode = 'polling' as const;

  private accessKey: string;
  private secretKey: string;

  constructor(options: ExecutorOptions) {
    this.accessKey = options.accessKey || '';
    this.secretKey = options.secretKey || '';
  }

  async submit(params: Record<string, unknown>): Promise<ExecutionResult> {
    try {
      const jwt = await this.generateJWT();

      // Convert image URL to base64 if needed
      let imageBase64 = params.image_path as string;
      if (imageBase64?.startsWith('http')) {
        logger.info('Downloading image for base64 conversion');
        try {
          const response = await fetch(imageBase64);
          if (!response.ok) {
            return { completed: true, error: `Failed to download image: ${response.status}` };
          }
          const buffer = await response.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          imageBase64 = btoa(binary);
        } catch (e) {
          return { completed: true, error: `Failed to convert image: ${(e as Error).message}` };
        }
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

      logger.info('Submitting video generation request');

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
        logger.error('API error', undefined, { status: response.status, error: errorText });
        return { completed: true, error: `Kling API error: ${response.status} - ${errorText}` };
      }

      const result = await response.json() as { 
        code: number; 
        message?: string; 
        data?: { task_id: string } 
      };

      if (result.code !== 0) {
        return { completed: true, error: `Kling API error: ${result.message}` };
      }

      logger.info('Video task submitted', { taskId: result.data?.task_id });

      return {
        completed: false,
        externalTaskId: result.data?.task_id,
        externalService: 'kling',
      };
    } catch (error) {
      logger.error('Submission failed', error as Error);
      return { completed: true, error: (error as Error).message };
    }
  }

  async poll(externalTaskId: string): Promise<ExecutionResult> {
    try {
      logger.info('Polling task', { taskId: externalTaskId });

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
        return { completed: false, error: `Kling API error: ${response.status}` };
      }

      const result = await response.json() as {
        code: number;
        message?: string;
        data?: {
          task_status: string;
          task_status_msg?: string;
          task_result?: { videos?: Array<{ url: string; duration: number }> };
        };
      };

      if (result.code !== 0) {
        return { completed: false, error: `Kling API error: ${result.message}` };
      }

      const data = result.data;
      if (!data) {
        return { completed: false, error: 'No data in response' };
      }

      if (data.task_status === 'succeed') {
        const videos = data.task_result?.videos || [];
        logger.info('Task succeeded', { videoUrl: videos[0]?.url });
        return {
          completed: true,
          resultUrl: videos[0]?.url,
          resultData: {
            duration: videos[0]?.duration,
            taskId: externalTaskId,
          },
        };
      } else if (data.task_status === 'failed') {
        return {
          completed: true,
          error: data.task_status_msg || 'Video generation failed',
        };
      }

      // Still processing
      return { completed: false };
    } catch (error) {
      logger.error('Polling failed', error as Error);
      return { completed: false, error: (error as Error).message };
    }
  }

  private async generateJWT(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      iss: this.accessKey,
      exp: now + 1800,
      nbf: now - 5,
    };

    const base64url = (str: string): string => {
      const base64 = btoa(str);
      return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };

    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(payload));
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

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

    let binary = '';
    for (let i = 0; i < signatureArray.length; i++) {
      binary += String.fromCharCode(signatureArray[i]);
    }
    const signature = base64url(binary);

    return `${signatureInput}.${signature}`;
  }
}
