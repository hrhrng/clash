import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client } from '@/lib/r2-upload';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ key: string[] }> }
) {
    try {
        const { key } = await context.params;
        const objectKey = key.join('/');

        console.log('[Asset View] Request:', {
            key,
            objectKey,
            bucketName: process.env.R2_BUCKET_NAME,
        });

        if (!objectKey) {
            return NextResponse.json({ error: 'Missing object key' }, { status: 400 });
        }

        const bucketName = process.env.R2_BUCKET_NAME;
        if (!bucketName) {
            console.error('R2_BUCKET_NAME is not configured');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const client = getR2Client();

        try {
            const command = new GetObjectCommand({
                Bucket: bucketName,
                Key: objectKey,
            });

            const response = await client.send(command);

            if (!response.Body) {
                return NextResponse.json({ error: 'Empty response body' }, { status: 404 });
            }

            // Convert the stream to a readable stream for the response
            // standard web streams are supported by Next.js App Router
            const webStream = response.Body.transformToWebStream();

            const headers = new Headers();
            if (response.ContentType) {
                headers.set('Content-Type', response.ContentType);
            }
            if (response.ContentLength) {
                headers.set('Content-Length', response.ContentLength.toString());
            }
            // Set cache headers to avoid repeated fetches for immutable assets
            headers.set('Cache-Control', 'public, max-age=31536000, immutable');

            return new NextResponse(webStream, {
                status: 200,
                headers,
            });

        } catch (s3Error: any) {
            if (s3Error.name === 'NoSuchKey') {
                return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
            }
            throw s3Error;
        }

    } catch (error: any) {
        console.error('[Asset View] Error:', error);
        return NextResponse.json(
            { error: 'Failed to retrieve asset' },
            { status: 500 }
        );
    }
}
