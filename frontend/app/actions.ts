'use server';

import { projects, messages } from '@/lib/db/schema';
import { eq, desc, asc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/lib/db/schema';
import { getRequestContext } from '@cloudflare/next-on-pages';

// Helper to get DB (D1 in production/preview, local SQLite in dev)
const getDb = async () => {
    // 1. Try to get D1 from Cloudflare context
    try {
        const ctx = getRequestContext();
        if (ctx.env.DB) {
            return drizzleD1(ctx.env.DB, { schema });
        }
    } catch (e) {
        // Ignore error if getRequestContext fails (e.g. not in Pages environment)
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

// Project Actions

export async function createProject(prompt: string) {
    const db = await getDb();
    const [project] = await db.insert(projects).values({
        name: prompt.length > 20 ? prompt.substring(0, 20) + '...' : prompt,
        description: prompt,
        nodes: [], // Start with empty canvas or generate initial state based on prompt
        edges: [],
    }).returning();

    redirect(`/projects/${project.id}`);
}

export async function getProjects() {
    const db = await getDb();
    return await db.query.projects.findMany({
        orderBy: [desc(projects.createdAt)],
        limit: 10,
    });
}

export async function getProject(id: string) {
    const db = await getDb();
    return await db.query.projects.findFirst({
        where: eq(projects.id, id),
        with: {
            messages: {
                orderBy: [asc(messages.createdAt)],
            },
        },
    });
}

export async function saveProjectState(id: string, nodes: any, edges: any) {
    const db = await getDb();
    await db.update(projects)
        .set({ nodes, edges })
        .where(eq(projects.id, id));
}

export async function updateProjectName(id: string, name: string) {
    const db = await getDb();
    await db.update(projects)
        .set({ name })
        .where(eq(projects.id, id));
    revalidatePath(`/projects/${id}`);
}

// Chat/Agent Actions

import { GoogleGenerativeAI } from '@google/generative-ai';

export type CommandType = 'ADD_NODE' | 'ADD_EDGE' | 'UPDATE_NODE' | 'DELETE_NODE';

export interface Command {
    type: CommandType;
    payload: any;
}

import { graph, AgentState } from './agent/graph';
import { HumanMessage } from '@langchain/core/messages';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

export async function sendMessage(projectId: string, content: string) {
    const db = await getDb();

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
    name: string;
    projectId: string;
    storageKey: string;
    url: string;
    type: 'image' | 'video';
    status?: 'pending' | 'processing' | 'completed' | 'failed';
    taskId?: string;
    metadata: string;
}) {
    const db = await getDb();
    const [asset] = await db.insert(schema.assets).values(data).returning();
    return asset;
}

export async function getAsset(id: string) {
    const db = await getDb();
    return await db.query.assets.findFirst({
        where: eq(schema.assets.id, id),
    });
}
