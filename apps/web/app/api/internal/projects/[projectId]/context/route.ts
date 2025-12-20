import { NextRequest, NextResponse } from 'next/server';
import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import * as schema from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { DEV_USER_ID, getUserIdFromHeaders } from '@/lib/auth/session';

// Shared DB helper (mirrors other internal routes)
const getDb = async () => {
    // Local dev should always use local SQLite.
    if (process.env.NODE_ENV === 'development') {
        const path = await import('path');
        const Database = (await import('better-sqlite3')).default;
        const dbPath = path.join(process.cwd(), 'local.db');
        const sqlite = new Database(dbPath);
        return drizzleSqlite(sqlite, { schema });
    }

    try {
        const { env } = await getCloudflareContext({ async: true });
        const bindings = env as unknown as { DB?: Parameters<typeof drizzleD1>[0] };
        if (bindings.DB) {
            return drizzleD1(bindings.DB, { schema });
        }
    } catch (e) {
        // ignore
    }

    throw new Error('No database connection available');
};

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params;
        const db = await getDb();

        let userId = await getUserIdFromHeaders(req.headers);
        if (!userId && process.env.NODE_ENV === 'development') {
            userId = DEV_USER_ID
        }
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const project = await db.query.projects.findFirst({
            where: eq(schema.projects.id, projectId),
        });

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        if (project.ownerId !== userId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // nodes/edges are stored as JSON columns in schema
        return NextResponse.json({
            nodes: project.nodes || [],
            edges: project.edges || [],
        });
    } catch (error) {
        console.error('Error fetching project context:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
