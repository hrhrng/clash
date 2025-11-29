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

        // Skip R2 upload for now, use Base64 directly
        const isPng = contentType?.includes('png');
        const prefix = isPng ? 'data:image/png;base64,' : 'data:image/jpeg;base64,';
        const result = {
            storageKey: `local/${fileName}`,
            url: base64Data.startsWith('data:') ? base64Data : `${prefix}${base64Data}`,
        };

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Image upload route error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to upload image' },
            { status: 500 }
        );
    }
}
