/**
 * Description generation utility using Gemini via LangChain.js with Vertex AI
 * Uses Vertex AI endpoint instead of AI Studio
 */

import { HumanMessage } from '@langchain/core/messages';
import { ChatVertexAI } from '@langchain/google-vertexai';

/**
 * Mask base64 data to prevent it from appearing in logs
 * @param data - Base64 string to mask
 * @returns Masked string showing only length
 */
function maskBase64(data: string): string {
  return `[BASE64_DATA:${data.length}_chars]`;
}

/**
 * Get safe preview of asset URL for logging (masks base64 data URIs)
 * @param url - Asset URL to preview
 * @returns Safe preview string
 */
function getSafeAssetPreview(url: string): string {
  if (url.startsWith('data:')) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const mimeType = match[1];
      const base64Length = match[2].length;
      return `data:${mimeType};base64,[REDACTED:${base64Length}_chars]`;
    }
    return '[DATA_URI:invalid_format]';
  }
  return url.length > 100 ? `${url.substring(0, 100)}...` : url;
}

/**
 * Sanitize error object to remove base64 data
 * @param error - Error object to sanitize
 * @returns Sanitized error message
 */
function sanitizeError(error: any): string {
  try {
    if (!error) return 'Unknown error';
    
    // Safely extract basic error info without processing huge strings
    let errorType = 'Error';
    let errorMessage = 'Unknown error';
    
    if (typeof error === 'string') {
      errorMessage = error.substring(0, 500); // Limit length
    } else if (error instanceof Error) {
      errorType = error.name || 'Error';
      errorMessage = error.message?.substring(0, 500) || 'No message';
      
      // Include first line of stack only
      if (error.stack) {
        const firstStackLine = error.stack.split('\n')[0];
        errorMessage = `${errorMessage} | ${firstStackLine.substring(0, 200)}`;
      }
    } else if (error && typeof error.message === 'string') {
      errorMessage = error.message.substring(0, 500);
    } else {
      errorMessage = 'Non-standard error object';
    }
    
    // Simple check: if message looks like it contains base64, truncate it
    if (/[A-Za-z0-9+/=]{100,}/.test(errorMessage)) {
      errorMessage = `${errorType}: [Message contains large data, truncated]`;
    }
    
    return `${errorType}: ${errorMessage}`;
  } catch (sanitizeErr) {
    // If sanitization itself fails, return a safe fallback
    return 'Error: Sanitization failed (possible circular reference)';
  }
}

/**
 * Generate JWT token for Google API authentication using service account
 */
async function generateGoogleJWT(
  clientEmail: string,
  privateKey: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };
  
  const claimSet = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  
  const base64url = (str: string): string => {
    const base64 = btoa(str);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedClaimSet = base64url(JSON.stringify(claimSet));
  const signatureInput = `${encodedHeader}.${encodedClaimSet}`;
  
  // Import private key
  const pemHeader = '-----BEGIN PRIVATE KEY-----';
  const pemFooter = '-----END PRIVATE KEY-----';
  const pemContents = privateKey
    .replace(pemHeader, '')
    .replace(pemFooter, '')
    .replace(/\s/g, '');
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );
  
  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signatureInput)
  );
  
  const signatureArray = new Uint8Array(signatureBuffer);
  let binary = '';
  for (let i = 0; i < signatureArray.length; i++) {
    binary += String.fromCharCode(signatureArray[i]);
  }
  const signature = base64url(binary);
  
  return `${signatureInput}.${signature}`;
}

/**
 * Get access token using service account JWT
 */
async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const jwt = await generateGoogleJWT(clientEmail, privateKey);
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }
  
  const result = await response.json() as { access_token: string };
  return result.access_token;
}

/**
 * Upload video to Google Files API via HTTP and get URI
 * Uses service account authentication (compatible with Cloudflare Workers)
 * @param videoData - Video buffer
 * @param mimeType - MIME type of the video
 * @param clientEmail - Service account email
 * @param privateKey - Service account private key
 * @returns URI of uploaded file
 */
async function uploadVideoToGoogleFilesHTTP(
  videoData: ArrayBuffer,
  mimeType: string,
  clientEmail: string,
  privateKey: string
): Promise<string> {
  console.log(`[Description] Uploading video to Google Files API (${videoData.byteLength} bytes)...`);
  
  // Get access token
  const accessToken = await getAccessToken(clientEmail, privateKey);
  
  // Step 1: Create file metadata
  const fileName = `video_${Date.now()}.mp4`;
  const metadata = {
    file: {
      display_name: fileName
    }
  };
  
  const metadataResponse = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': videoData.byteLength.toString(),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata)
  });
  
  if (!metadataResponse.ok) {
    const errorText = await metadataResponse.text();
    throw new Error(`Failed to initiate upload: ${metadataResponse.status} - ${errorText}`);
  }
  
  // Get upload URL from response header
  const uploadUrl = metadataResponse.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) {
    throw new Error('No upload URL returned from Files API');
  }
  
  console.log(`[Description] Upload initiated, uploading data...`);
  
  // Step 2: Upload the actual file data
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': videoData.byteLength.toString(),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: videoData
  });
  
  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`Failed to upload video data: ${uploadResponse.status} - ${errorText}`);
  }
  
  const result = await uploadResponse.json() as { file?: { uri?: string; name?: string } };
  const fileUri = result.file?.uri || result.file?.name;
  
  if (!fileUri) {
    throw new Error('No file URI returned from Google Files API');
  }
  
  console.log(`[Description] ✅ Video uploaded to Google Files API: ${fileUri}`);
  return fileUri;
}

/**
 * Generate a description for an asset (image or video) using Gemini via Vertex AI
 * 
 * @param projectId - GCP project ID
 * @param location - GCP location (e.g., 'us-central1')
 * @param credentials - GCP service account credentials
 * @param assetUrl - URL or data URI of the asset
 * @param mimeType - MIME type of the asset (e.g., 'image/png', 'video/mp4')
 * @returns Promise resolving to description text, or null if generation fails
 */
export async function generateDescription(
  projectId: string,
  location: string,
  credentials: { client_email: string; private_key: string },
  assetUrl: string,
  mimeType: string
): Promise<string | null> {
  const maxRetries = 3;
  const baseDelay = 2000; // 2 seconds
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Description] Generating description for asset (attempt ${attempt}/${maxRetries}): ${getSafeAssetPreview(assetUrl)}`);
      
      // Prepare the content block
      const contentBlock: any[] = [
        { type: 'text', text: 'Describe this asset in detail. Focus on visual elements, style, and mood.' }
      ];

      // Handle video vs image  
      const isVideo = mimeType.startsWith('video/');
      
      if (isVideo) {
        // For videos: fetch the video data and upload to Google Files API
        // This works even with localhost URLs since we fetch from the same Worker
        console.log('[Description] Video detected, uploading to Google Files API...');
        
        try {
          // Fetch video data from URL (works for localhost too since it's internal)
          console.log(`[Description] Fetching video from: ${getSafeAssetPreview(assetUrl)}`);
          const videoResponse = await fetch(assetUrl);
          if (!videoResponse.ok) {
            throw new Error(`Failed to fetch video: HTTP ${videoResponse.status}`);
          }
          
          const videoData = await videoResponse.arrayBuffer();
          console.log(`[Description] Video fetched: ${videoData.byteLength} bytes`);
          
          // Upload to Google Files API
          const fileUri = await uploadVideoToGoogleFilesHTTP(
            videoData,
            mimeType,
            credentials.client_email,
            credentials.private_key
          );
          
          // Use fileUri in content block
          contentBlock.push({
            type: 'media',
            fileUri: fileUri,
            mimeType: mimeType,
          });
          
          console.log(`[Description] Video uploaded to Google Files API: ${fileUri}`);
        } catch (fetchError) {
          console.error('[Description] Failed to process video:', sanitizeError(fetchError));
          throw fetchError;
        }
      } else {
        // For images, we can still use base64 (they're smaller)
        let base64Data: string;
        let actualMimeType = mimeType;

        if (assetUrl.startsWith('data:')) {
          // Parse data URI
          const match = assetUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (!match) {
            console.error('[Description] Invalid data URI format:', getSafeAssetPreview(assetUrl));
            return null;
          }
          actualMimeType = match[1];
          base64Data = match[2];
        } else {
          // Fetch URL and convert to base64
          try {
            console.log(`[Description] Fetching image from URL...`);
            const response = await fetch(assetUrl);
            if (!response.ok) {
              console.error(`[Description] Failed to fetch asset from ${getSafeAssetPreview(assetUrl)}: HTTP ${response.status}`);
              throw new Error(`HTTP ${response.status}: ${getSafeAssetPreview(assetUrl)}`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            base64Data = btoa(binary);
            
            // Try to get content type from response
            const contentType = response.headers.get('content-type');
            if (contentType) {
              actualMimeType = contentType;
            }
            
            console.log(`[Description] Image fetched and converted to base64 (${base64Data.length} chars)`);
          } catch (error) {
            console.error('[Description] Failed to fetch asset:', sanitizeError(error));
            throw error; // Re-throw to trigger retry
          }
        }

        // Add image to content block
        contentBlock.push({
          type: 'image_url',
          image_url: `data:${actualMimeType};base64,${base64Data}`,
        });
      }

      // Initialize ChatVertexAI (using Vertex AI endpoint)
      const llm = new ChatVertexAI({
        model: 'gemini-2.5-flash',
        location: location,
        authOptions: {
          credentials: {
            client_email: credentials.client_email,
            private_key: credentials.private_key,
          },
          projectId: projectId,
        },
      });

      // Create HumanMessage with content block
      const message = new HumanMessage({ content: contentBlock });

      // Generate description
      console.log(`[Description] Calling Gemini via Vertex AI with ${contentBlock.length} parts...`);
      const response = await llm.invoke([message]);

      const description = response.content as string;
      if (!description) {
        console.error('[Description] No content in Gemini response for asset:', getSafeAssetPreview(assetUrl));
        throw new Error('Empty response from Gemini');
      }

      console.log(`[Description] ✅ Description generated: "${description.substring(0, 100)}..."`);
      
      return description.trim();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      console.error(`[Description] Error generating description (attempt ${attempt}/${maxRetries}):`, sanitizeError(error));
      
      if (isLastAttempt) {
        console.error('[Description] ❌ All retry attempts failed');
        return null;
      }
      
      // Exponential backoff: 2s, 4s, 8s
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`[Description] ⏳ Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return null;
}
