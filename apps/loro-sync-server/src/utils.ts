import type { Env } from './types';

/**
 * Get public URL for an asset stored in R2
 * 
 * For local development with --remote:
 * - R2 assets are stored in real Cloudflare R2
 * - But we need a public URL that external services (Vertex AI) can access
 * - WORKER_PUBLIC_URL should point to a deployed worker or tunnel URL
 * 
 * @param env - Worker environment
 * @param objectKey - R2 object key (path within the bucket)
 * @returns Public URL for the asset
 */
export function getAssetUrl(env: Env, objectKey: string): string {
  // Use Worker's /assets/ endpoint (must be publicly accessible)
  // For local dev: use ngrok/cloudflare tunnel, or deployed worker URL
  // For production: use the deployed worker URL
  if (env.WORKER_PUBLIC_URL) {
    const baseUrl = env.WORKER_PUBLIC_URL.replace(/\/$/, '');
    const url = `${baseUrl}/assets/${objectKey}`;
    console.log(`[Utils] Using Worker URL: ${url.slice(0, 80)}...`);
    return url;
  }
  
  // Fallback to localhost (external AI services cannot access)
  const url = `http://localhost:8787/assets/${objectKey}`;
  console.warn(`[Utils] ⚠️ No WORKER_PUBLIC_URL configured, using localhost`);
  console.warn(`[Utils] 💡 Set WORKER_PUBLIC_URL to a public URL for video descriptions to work`);
  return url;
}
