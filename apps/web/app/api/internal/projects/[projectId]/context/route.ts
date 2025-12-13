import { NextRequest, NextResponse } from 'next/server';
import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { getRequestContext } from '@cloudflare/next-on-pages';
import * as schema from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Shared DB helper (mirrors other internal routes)
const getDb = async () => {
    try {
        const ctx = getRequestContext();
        if (ctx.env.DB) {
            return drizzleD1(ctx.env.DB, { schema });
        }
    } catch (e) {
        // ignore
    }

    if (process.env.NODE_ENV === 'development') {
        const path = await import('path');
        const Database = (await import('better-sqlite3')).default;
        const dbPath = path.join(process.cwd(), 'local.db');
        const sqlite = new Database(dbPath);
        return drizzleSqlite(sqlite, { schema });
    }

    throw new Error('No database connection available');
};

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params;
        const db = await getDb();

        const project = await db.query.projects.findFirst({
            where: eq(schema.projects.id, projectId),
        });

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
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
