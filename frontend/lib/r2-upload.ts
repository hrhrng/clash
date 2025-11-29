/**
 * R2 Upload utility for frontend
 * Uses S3-compatible API to upload files to Cloudflare R2
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Initialize R2 client with environment variables
function getR2Client() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accountId || !accessKeyId || !secretAccessKey) {
        throw new Error('R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env');
    }

    return new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId,
            secretAccessKey,
        },
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

    const bucketName = process.env.R2_BUCKET_NAME;
    const publicUrl = process.env.R2_PUBLIC_URL;

    if (!bucketName || !publicUrl) {
        throw new Error('R2 bucket not configured. Set R2_BUCKET_NAME and R2_PUBLIC_URL in .env');
    }

    // Decode base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Generate storage key
    const storageKey = `projects/${projectId}/assets/${fileName}`;

    // Upload to R2
    const client = getR2Client();
    await client.send(
        new PutObjectCommand({
            Bucket: bucketName,
            Key: storageKey,
            Body: buffer,
            ContentType: contentType,
        })
    );

    // Return public URL
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
    const storageKey = `projects/${projectId}/assets/${fileName}.mp4`;

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

    // Return public URL
    const url = `${publicUrl}/${storageKey}`;

    return { storageKey, url };
}
