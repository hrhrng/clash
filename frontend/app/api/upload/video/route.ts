import { NextRequest, NextResponse } from 'next/server';
import { uploadVideoFromUrlToR2 } from '@/lib/r2-upload';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { videoUrl, projectId, fileName } = body;

        if (!videoUrl || !projectId || !fileName) {
            return NextResponse.json(
                { error: 'Missing required fields: videoUrl, projectId, fileName' },
                { status: 400 }
            );
        }

        // Skip R2 upload for now, use original URL directly
        const result = {
            storageKey: `local/${fileName}.mp4`,
            url: videoUrl,
        };

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Video upload route error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to upload video' },
            { status: 500 }
        );
    }
}
