import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

        const response = await fetch(`${backendUrl}/api/generate/image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Backend request failed' }));
            return NextResponse.json(error, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Image generation proxy error:', error);
        return NextResponse.json(
            { detail: error.message || 'Failed to proxy generation request' },
            { status: 500 }
        );
    }
}
