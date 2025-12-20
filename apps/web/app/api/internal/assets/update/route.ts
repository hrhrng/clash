import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/lib/db/schema';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { uploadBufferToR2, uploadVideoFromUrlToR2 } from '@/lib/r2-upload';

// Helper to get DB (duplicated from actions.ts for now)
const getDb = async () => {
    // Local dev should always use local SQLite.
    if (process.env.NODE_ENV === 'development') {
        const path = await import('path');
        const Database = (await import('better-sqlite3')).default;
        const dbPath = path.join(process.cwd(), 'local.db');
        const sqlite = new Database(dbPath);
        return drizzleSqlite(sqlite, { schema });
    }

    // 1. Try to get D1 from Cloudflare context
    try {
        const { env } = await getCloudflareContext({ async: true });
        const bindings = env as unknown as { DB?: Parameters<typeof drizzleD1>[0] };
        if (bindings.DB) {
            return drizzleD1(bindings.DB, { schema });
        }
    } catch (e) {
        // Ignore error
    }

    throw new Error('No database connection available');
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { taskId, status, url, metadata, description } = body;

        if (!taskId || !status) {
            return NextResponse.json({ error: 'Missing taskId or status' }, { status: 400 });
        }

        console.log('[API] /api/internal/assets/update received:', { taskId, status, url });

        const db = await getDb();

        // Find asset by taskId
        const asset = await db.query.assets.findFirst({
            where: eq(schema.assets.taskId, taskId),
        });

        if (!asset) {
            console.error('[API] Asset not found for taskId:', taskId);
            return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
        }

        console.log('[API] Found asset:', asset.id, 'Current status:', asset.status);

        let updatedUrl = url || asset.url;
        let updatedStorageKey = asset.storageKey;

        const r2PublicBase = process.env.R2_PUBLIC_URL;
        const shouldUploadToR2 = status === 'completed'
            && updatedUrl
            && typeof updatedUrl === 'string'
            && (!r2PublicBase || !updatedUrl.startsWith(r2PublicBase));

        if (shouldUploadToR2 && updatedUrl) {
            // Always upload generated assets to R2 so we don't persist base64 or external URLs
            if (updatedUrl.includes('base64,')) {
                const mimeMatch = updatedUrl.match(/^data:(.*?);base64,(.*)$/);
                const contentType = mimeMatch?.[1] || (asset.type === 'video' ? 'video/mp4' : 'image/png');
                const base64Payload = mimeMatch?.[2] || updatedUrl.split('base64,')[1];
                const ext = contentType.split('/')[1]?.split(';')[0] || (asset.type === 'video' ? 'mp4' : 'png');

                const uploadResult = await uploadBufferToR2({
                    buffer: Buffer.from(base64Payload, 'base64'),
                    projectId: asset.projectId,
                    fileName: `${asset.id}.${ext}`,
                    contentType,
                });

                updatedUrl = uploadResult.url;
                updatedStorageKey = uploadResult.storageKey;
            } else if (asset.type === 'video') {
                const uploadResult = await uploadVideoFromUrlToR2({
                    videoUrl: updatedUrl,
                    projectId: asset.projectId,
                    fileName: asset.id,
                });

                updatedUrl = uploadResult.url;
                updatedStorageKey = uploadResult.storageKey;
            } else {
                const response = await fetch(updatedUrl);
                if (!response.ok) {
                    throw new Error(`Failed to fetch asset from ${updatedUrl}: ${response.status}`);
                }

                const arrayBuffer = await response.arrayBuffer();
                const contentType = response.headers.get('content-type') || 'application/octet-stream';
                const extension = contentType.split('/')[1]?.split(';')[0] || 'bin';

                const uploadResult = await uploadBufferToR2({
                    buffer: arrayBuffer,
                    projectId: asset.projectId,
                    fileName: `${asset.id}.${extension}`,
                    contentType,
                });

                updatedUrl = uploadResult.url;
                updatedStorageKey = uploadResult.storageKey;
            }
        }

        const metadataValue = metadata
            ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata))
            : asset.metadata;

        // Update asset
        await db.update(schema.assets)
            .set({
                status,
                url: updatedUrl,
                storageKey: updatedStorageKey,
                description: description || asset.description,
                metadata: metadataValue,
                // updatedAt: new Date(), // Assuming updatedAt exists? Schema doesn't have it for assets, only createdAt.
            })
            .where(eq(schema.assets.id, asset.id));

        console.log('[API] Asset updated successfully');

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Update asset error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
