/**
 * R2 Storage Client for loro-sync-server
 * Uses S3-compatible API to access Cloudflare R2
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { Env } from './types';

let s3Client: S3Client | null = null;

/**
 * Get or create S3 client for R2 access
 */
export function getR2Client(env: Env): S3Client {
  if (!s3Client) {
    const accountId = env.R2_ACCOUNT_ID;
    const accessKeyId = env.R2_ACCESS_KEY_ID;
    const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
    
    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error('R2 credentials not configured in environment');
    }
    
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
    });
  }
  
  return s3Client;
}

/**
 * Get object from R2 bucket using S3 API
 */
export async function getObjectFromR2(
  env: Env, 
  key: string
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  const client = getR2Client(env);
  const bucketName = env.R2_BUCKET_NAME || 'master-clash-assets';
  
  console.log(`[R2Client] Fetching object: ${key} from bucket: ${bucketName}`);
  
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });
  
  const response = await client.send(command);
  
  if (!response.Body) {
    throw new Error(`Empty response body for key: ${key}`);
  }
  
  // Convert stream to ArrayBuffer
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as any) {
    chunks.push(chunk);
  }
  const buffer = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  
  return {
    buffer: buffer.buffer,
    contentType: response.ContentType || 'application/octet-stream',
  };
}

/**
 * Put object to R2 bucket using S3 API
 */
export async function putObjectToR2(
  env: Env,
  key: string,
  body: ArrayBuffer | Uint8Array,
  contentType: string = 'application/octet-stream'
): Promise<void> {
  const client = getR2Client(env);
  const bucketName = env.R2_BUCKET_NAME || 'master-clash-assets';
  
  console.log(`[R2Client] Uploading object: ${key} to bucket: ${bucketName} (${body.byteLength} bytes)`);
  
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: body instanceof ArrayBuffer ? new Uint8Array(body) : body,
    ContentType: contentType,
  });
  
  await client.send(command);
  console.log(`[R2Client] ✅ Upload complete: ${key}`);
}
