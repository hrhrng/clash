import { NextRequest, NextResponse } from 'next/server';
import { getAsset } from '@/app/actions';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const asset = await getAsset(id);
        if (!asset) {
            return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
        }
        return NextResponse.json(asset);
    } catch (error: any) {
        console.error('Error fetching asset:', error);
        return NextResponse.json(
            { error: 'Failed to fetch asset' },
            { status: 500 }
        );
    }
}
