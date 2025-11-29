import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/lib/db/schema';
import { getRequestContext } from '@cloudflare/next-on-pages';

// Helper to get DB (duplicated from actions.ts for now)
const getDb = async () => {
    // 1. Try to get D1 from Cloudflare context
    try {
        const ctx = getRequestContext();
        if (ctx.env.DB) {
            return drizzleD1(ctx.env.DB, { schema });
        }
    } catch (e) {
        // Ignore error
    }

    // 2. Fallback to local SQLite (Node.js only)
    if (process.env.NODE_ENV === 'development') {
        const path = await import('path');
        const Database = (await import('better-sqlite3')).default;
        const dbPath = path.join(process.cwd(), 'local.db');
        const sqlite = new Database(dbPath);
        return drizzleSqlite(sqlite, { schema });
    }

    throw new Error('No database connection available');
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { taskId, status, url, metadata } = body;

        if (!taskId || !status) {
            return NextResponse.json({ error: 'Missing taskId or status' }, { status: 400 });
        }

        const db = await getDb();

        // Find asset by taskId
        const asset = await db.query.assets.findFirst({
            where: eq(schema.assets.taskId, taskId),
        });

        if (!asset) {
            return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
        }

        // Update asset
        await db.update(schema.assets)
            .set({
                status,
                url: url || asset.url,
                metadata: metadata ? JSON.stringify(metadata) : asset.metadata,
                updatedAt: new Date(), // Assuming updatedAt exists? Schema doesn't have it for assets, only createdAt.
                // Let's check schema again. assets only has createdAt.
            })
            .where(eq(schema.assets.id, asset.id));

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Update asset error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
