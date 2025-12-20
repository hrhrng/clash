/**
 * R2 Upload utility for frontend
 * Uses S3-compatible API to upload files to Cloudflare R2
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const sanitizeFileName = (fileName: string) => fileName.replace(/[^a-zA-Z0-9._-]/g, '_');

const buildStorageKey = (projectId: string, fileName: string) => {
    return `projects/${projectId}/assets/${sanitizeFileName(fileName)}`;
};

// Initialize R2 client with environment variables
function getR2Client() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const rawEndpoint = process.env.R2_ENDPOINT;

    if (!accountId || !accessKeyId || !secretAccessKey) {
        throw new Error('R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env');
    }


    return new S3Client({
        region: 'auto',
        endpoint: rawEndpoint,
        credentials: {
            accessKeyId,
            secretAccessKey,
        },
        forcePathStyle: true,
    });
}

/**
 * Upload base64 image to R2
 */
export async function uploadBase64ImageToR2(params: {
    base64Data: string;
    projectId: string;
    fileName: string;
    contentType?: string;
}) {
    const { base64Data, projectId, fileName, contentType = 'image/png' } = params;

    const isDev = process.env.NODE_ENV !== 'production';
    console.log('[R2 Upload] Environment:', process.env.NODE_ENV, 'isDev:', isDev);
    
    // In development, use local loro-sync-server API
    if (isDev) {
        console.log('[R2 Upload] Using local loro-sync-server API');
        const normalizedBase64 = base64Data.includes('base64,')
            ? base64Data.split('base64,')[1]
            : base64Data;
        
        const buffer = Buffer.from(normalizedBase64, 'base64');
        const blob = new Blob([buffer], { type: contentType });
        const file = new File([blob], fileName, { type: contentType });
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('projectId', projectId);
        
        const response = await fetch('http://localhost:8787/upload', {
            method: 'POST',
            body: formData,
        });
        
        if (!response.ok) {
            throw new Error(`Upload failed: ${response.statusText}`);
        }
        
        return await response.json() as { storageKey: string; url: string };
    }

    console.log('[R2 Upload] Using S3 API (production mode)');

    // Production: use S3 API
    const bucketName = process.env.R2_BUCKET_NAME;
    const publicUrl = process.env.R2_PUBLIC_URL;

    if (!bucketName || !publicUrl) {
        throw new Error('R2 bucket not configured. Set R2_BUCKET_NAME and R2_PUBLIC_URL in .env');
    }

    const normalizedBase64 = base64Data.includes('base64,')
        ? base64Data.split('base64,')[1]
        : base64Data;

    const buffer = Buffer.from(normalizedBase64, 'base64');
    const storageKey = buildStorageKey(projectId, fileName);

    const client = getR2Client();
    await client.send(
        new PutObjectCommand({
            Bucket: bucketName,
            Key: storageKey,
            Body: buffer,
            ContentType: contentType,
        })
    );

    const url = `${publicUrl}/${storageKey}`;
    return { storageKey, url };
}

/**
 * Download video from URL and upload to R2
 */
export async function uploadVideoFromUrlToR2(params: {
    videoUrl: string;
    projectId: string;
    fileName: string;
}) {
    const { videoUrl, projectId, fileName } = params;

    const bucketName = process.env.R2_BUCKET_NAME;
    const publicUrl = process.env.R2_PUBLIC_URL;

    if (!bucketName || !publicUrl) {
        throw new Error('R2 bucket not configured. Set R2_BUCKET_NAME and R2_PUBLIC_URL in .env');
    }

    // Download video
    const response = await fetch(videoUrl);
    if (!response.ok) {
        throw new Error(`Failed to download video: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate storage key
    const storageKey = buildStorageKey(projectId, `${fileName}.mp4`);

    // Upload to R2
    const client = getR2Client();
    await client.send(
        new PutObjectCommand({
            Bucket: bucketName,
            Key: storageKey,
            Body: buffer,
            ContentType: 'video/mp4',
        })
    );

    // Return URL - use local assets endpoint in development
    const isDev = process.env.NODE_ENV !== 'production';
    const url = isDev 
        ? `http://localhost:8787/assets/${storageKey}`
        : `${publicUrl}/${storageKey}`;

    return { storageKey, url };
}

/**
 * Upload arbitrary binary data (Buffer/ArrayBuffer/Uint8Array) to R2
 */
export async function uploadBufferToR2(params: {
    buffer: Buffer | ArrayBuffer | Uint8Array;
    projectId: string;
    fileName: string;
    contentType?: string;
}) {
    const { buffer, projectId, fileName, contentType = 'application/octet-stream' } = params;

    const isDev = process.env.NODE_ENV !== 'production';
    console.log('[R2 Upload Buffer] Environment:', process.env.NODE_ENV, 'isDev:', isDev);
    
    // In development, use local loro-sync-server API
    if (isDev) {
        console.log('[R2 Upload Buffer] Using local loro-sync-server API');
        const normalizedBuffer = Buffer.isBuffer(buffer)
            ? new Uint8Array(buffer)
            : buffer instanceof ArrayBuffer
                ? new Uint8Array(buffer)
                : buffer;
        const blob = new Blob([normalizedBuffer as BlobPart], { type: contentType });
        const file = new File([blob], fileName, { type: contentType });
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('projectId', projectId);
        
        const response = await fetch('http://localhost:8787/upload', {
            method: 'POST',
            body: formData,
        });
        
        if (!response.ok) {
            throw new Error(`Upload failed: ${response.statusText}`);
        }
        
        return await response.json() as { storageKey: string; url: string };
    }

    console.log('[R2 Upload Buffer] Using S3 API (production mode)');

    // Production: use S3 API
    const bucketName = process.env.R2_BUCKET_NAME;
    const publicUrl = process.env.R2_PUBLIC_URL;

    if (!bucketName || !publicUrl) {
        throw new Error('R2 bucket not configured. Set R2_BUCKET_NAME and R2_PUBLIC_URL in .env');
    }

    const normalizedBuffer = Buffer.isBuffer(buffer)
        ? buffer
        : buffer instanceof ArrayBuffer
            ? Buffer.from(buffer)
            : Buffer.from(buffer);

    const storageKey = buildStorageKey(projectId, fileName);

    const client = getR2Client();
    await client.send(
        new PutObjectCommand({
            Bucket: bucketName,
            Key: storageKey,
            Body: normalizedBuffer,
            ContentType: contentType,
        })
    );

    const url = `${publicUrl}/${storageKey}`;
    return { storageKey, url };
}
