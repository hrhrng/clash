import type { Env } from './types';

/**
 * Get public URL for an asset stored in R2
 * Uses R2_PUBLIC_URL if configured, otherwise falls back to localhost
 * 
 * @param env - Worker environment
 * @param objectKey - R2 object key (path within the bucket)
 * @returns Public URL for the asset
 */
export function getAssetUrl(env: Env, objectKey: string): string {
  if (env.R2_PUBLIC_URL) {
    // Remove trailing slash if present
    const baseUrl = env.R2_PUBLIC_URL.replace(/\/$/, '');
    const url = `${baseUrl}/${objectKey}`;
    console.log(`[Utils] Using R2 public URL: ${url}`);
    return url;
  }
  
  // Fallback to localhost for development without R2 public URL configured
  const url = `http://localhost:8787/assets/${objectKey}`;
  console.warn(`[Utils] ⚠️ R2_PUBLIC_URL not configured, using localhost: ${url}`);
  console.warn(`[Utils] 💡 External services (like Vertex AI) will not be able to access this URL`);
  return url;
}
