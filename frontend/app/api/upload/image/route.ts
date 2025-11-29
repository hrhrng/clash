import { NextRequest, NextResponse } from 'next/server';
import { uploadBase64ImageToR2 } from '@/lib/r2-upload';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { base64Data, projectId, fileName, contentType } = body;

        if (!base64Data || !projectId || !fileName) {
            return NextResponse.json(
                { error: 'Missing required fields: base64Data, projectId, fileName' },
                { status: 400 }
            );
        }

        const result = await uploadBase64ImageToR2({
            base64Data,
            projectId,
            fileName,
            contentType,
        });

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Image upload error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to upload image' },
            { status: 500 }
        );
    }
}
