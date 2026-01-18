'use server';

import { projects, messages } from '@/lib/db/schema';
import { and, eq, desc, asc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { drizzle as drizzleD1 } from 'drizzle-orm/d1';

import * as schema from '@/lib/db/schema';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { headers } from 'next/headers';
import { DEV_USER_ID, getUserIdFromHeaders, getUserIdOrDevFromHeaders } from '@/lib/auth/session';

// Helper to get DB (D1 binding via Cloudflare context)
// Note: initOpenNextCloudflareForDev() in next.config.ts enables bindings during next dev
// Proxy must be set via HTTP_PROXY env var in startup command for network access
const getDb = async () => {
    try {
        const { env } = await getCloudflareContext({ async: true });
        const bindings = env as unknown as { DB?: Parameters<typeof drizzleD1>[0] };
        
        console.log('[getDb] Cloudflare env keys:', Object.keys(env || {}));
        
        if (bindings.DB) {
            console.log('[getDb] D1 binding found');
            return drizzleD1(bindings.DB, { schema });
        } else {
            console.warn('[getDb] D1 binding (DB) is missing from context');
        }
    } catch (e) {
        console.error('[getDb] Failed to get Cloudflare context:', e);
    }

    throw new Error('No database connection available');
}


async function getUserId() {
    const h = new Headers(await headers())
    const userId = await getUserIdFromHeaders(h)
    if (userId) return userId
    if (process.env.NODE_ENV === 'development') return DEV_USER_ID
    return null
}

async function requireUserId() {
    const h = new Headers(await headers())
    return getUserIdOrDevFromHeaders(h)
}

async function ensureDevUserExists(db: Awaited<ReturnType<typeof getDb>>) {
    if (process.env.NODE_ENV !== 'development') return
    await db.run(
        sql`INSERT OR IGNORE INTO users (id, name, email, email_verified) VALUES (${DEV_USER_ID}, ${'Dev User'}, ${'dev@local'}, ${1})`
    )
}

// Project Actions

export async function createProject(prompt: string) {
    const db = await getDb();
    const userId = await requireUserId();
    if (userId === DEV_USER_ID) {
        await ensureDevUserExists(db)
    }
    const [project] = await db.insert(projects).values({
        ownerId: userId,
        name: prompt.length > 20 ? prompt.substring(0, 20) + '...' : prompt,
        description: prompt,
        nodes: [], // Start with empty canvas
        edges: [],
    }).returning();

    // Simple approach: Pass prompt via URL parameter
    // ChatbotCopilot will send it as a normal message
    redirect(`/projects/${project.id}?prompt=${encodeURIComponent(prompt)}`);
}

export async function getProjects(limit = 10) {
    try {
        const db = await getDb();
        const userId = await getUserId();
        if (!userId) return [];
        if (userId === DEV_USER_ID) {
            await ensureDevUserExists(db)
        }
        return await db.query.projects.findMany({
            where: eq(projects.ownerId, userId),
            orderBy: [desc(projects.createdAt)],
            limit: limit,
            with: {
                assets: {
                    limit: 12,
                    // Sort by type (image < video, so images come first) then by creation time
                    orderBy: [asc(schema.assets.type), desc(schema.assets.createdAt)],
                }
            }
        });
    } catch (error) {
        console.error('[getProjects] Failed to fetch projects:', error);
        return [];
    }
}

export async function getProject(id: string) {
    try {
        const db = await getDb();
        const userId = await getUserId();
        if (!userId) return null;
        if (userId === DEV_USER_ID) {
            await ensureDevUserExists(db)
        }
        return await db.query.projects.findFirst({
            where: and(eq(projects.id, id), eq(projects.ownerId, userId)),
            with: {
                messages: {
                    orderBy: [asc(messages.createdAt)],
                },
            },
        });
    } catch (error) {
        console.error(`[getProject] Failed to fetch project ${id}:`, error);
        return null;
    }
}

/**
 * @deprecated No-op: Loro is the single source of truth for nodes/edges.
 * This function is kept for backward compatibility but does nothing.
 * Canvas state is now managed entirely by Loro sync.
 */
export async function saveProjectState(_id: string, _nodes: any, _edges: any) {
    // No-op: Loro handles canvas state sync
    console.log('[saveProjectState] No-op: Loro is the single source of truth');
}

export async function updateProjectName(id: string, name: string) {
    const db = await getDb();
    const userId = await requireUserId();
    if (userId === DEV_USER_ID) {
        await ensureDevUserExists(db)
    }
    await db.update(projects)
        .set({ name })
        .where(and(eq(projects.id, id), eq(projects.ownerId, userId)));
    revalidatePath(`/projects/${id}`);
}

export async function deleteProject(id: string) {
    const db = await getDb();
    const userId = await requireUserId();
    if (userId === DEV_USER_ID) {
        await ensureDevUserExists(db)
    }
    await db.delete(projects).where(and(eq(projects.id, id), eq(projects.ownerId, userId)));
    revalidatePath('/projects');
}

// Chat/Agent Actions



export type CommandType = 'ADD_NODE' | 'ADD_EDGE' | 'UPDATE_NODE' | 'DELETE_NODE';

export interface Command {
    type: CommandType;
    payload: any;
}

import { graph, AgentState } from './agent/graph';
import { HumanMessage } from '@langchain/core/messages';
import { generateSemanticId } from '@/lib/utils/semanticId';

// const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

export async function sendMessage(projectId: string, content: string) {
    const db = await getDb();
    const userId = await requireUserId();
    if (userId === DEV_USER_ID) {
        await ensureDevUserExists(db)
    }

    const project = await db.query.projects.findFirst({
        where: and(eq(projects.id, projectId), eq(projects.ownerId, userId)),
        columns: { id: true },
    });
    if (!project) {
        throw new Error('Project not found')
    }

    // 1. Save user message
    await db.insert(messages).values({
        content,
        role: 'user',
        projectId,
    });

    let agentResponseText = "I'm sorry, I couldn't process that request.";
    let commands: Command[] = [];

    try {
        // 2. Invoke LangGraph
        const inputs = {
            messages: [new HumanMessage(content)],
        };

        const config = { configurable: { thread_id: projectId } };
        const state = await graph.invoke(inputs, config) as unknown as AgentState;

        const lastMessage = state.messages[state.messages.length - 1];
        agentResponseText = lastMessage.content as string;
        commands = state.commands || [];

    } catch (error) {
        console.error("AI Error:", error);
        agentResponseText = "I encountered an error connecting to my brain. Please check the API key.";
    }

    await db.insert(messages).values({
        content: agentResponseText,
        role: 'assistant',
        projectId,
    });

    revalidatePath(`/projects/${projectId}`);
    return { success: true, commands };
}



export async function createAsset(data: {
    id?: string; // Optional pre-allocated ID from backend
    name: string;
    projectId: string;
    storageKey: string;
    url: string;
    type: 'image' | 'video';
    status?: 'pending' | 'processing' | 'completed' | 'failed';
    taskId?: string;
    metadata: string;
}) {
    console.log('createAsset called with:', data);
    try {
        const db = await getDb();
        const userId = await requireUserId();
        if (userId === DEV_USER_ID) {
            await ensureDevUserExists(db)
        }

        const project = await db.query.projects.findFirst({
            where: and(eq(projects.id, data.projectId), eq(projects.ownerId, userId)),
            columns: { id: true },
        });
        if (!project) {
            throw new Error('Project not found')
        }

        // Use pre-allocated ID if provided, otherwise generate semantic ID for asset
        let assetId = data.id || await generateSemanticId(data.projectId);

        // Ensure taskId exists
        const taskId = data.taskId || crypto.randomUUID();
        const baseAssetData = { ...data, taskId };

        // Insert asset first, retry once with a fresh ID if the pre-allocated one collides
        let asset;
        try {
            [asset] = await db.insert(schema.assets).values({
                ...baseAssetData,
                id: assetId,
                description: null // Start with null description
            }).returning();
        } catch (error: any) {
            const message = String(error?.message || '');
            const isIdConflict =
                message.includes('UNIQUE constraint failed: asset.id') ||
                message.includes('UNIQUE constraint failed: assets.id') ||
                message.includes('SQLITE_CONSTRAINT');

            if (!isIdConflict) {
                throw error;
            }

            // Generate a new ID and retry once
            assetId = await generateSemanticId(data.projectId);
            console.warn('[createAsset] assetId collision, retrying with new id', { previous: data.id, retry: assetId });

            [asset] = await db.insert(schema.assets).values({
                ...baseAssetData,
                id: assetId,
                description: null
            }).returning();
        }

        console.log('createAsset success:', asset);

        // Trigger async description generation if completed immediately (e.g. upload)
        if (data.status === 'completed') {
            // Construct callback URL
            const headersList = await headers();
            const host = headersList.get('host');
            const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
            const callbackUrl = `${protocol}://${host}/api/internal/assets/update`;

            // Fire and forget
            fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8888'}/api/describe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    url: data.url,
                    task_id: taskId,
                    callback_url: callbackUrl
                }),
            }).catch(err => console.error('Error triggering description generation:', err));
        }

        return asset;
    } catch (error) {
        console.error('createAsset failed:', error);
        throw error;
    }
}

export async function getAsset(id: string) {
    const db = await getDb();
    return await db.query.assets.findFirst({
        where: eq(schema.assets.id, id),
    });
}
