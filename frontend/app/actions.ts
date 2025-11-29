'use server';

import { projects, messages } from '@/lib/db/schema';
import { eq, desc, asc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '@/lib/db/schema';
import path from 'path';

// Helper to get DB (local dev with better-sqlite3)
const getDb = () => {
    const dbPath = path.join(process.cwd(), 'local.db');
    const sqlite = new Database(dbPath);
    return drizzle(sqlite, { schema });
}

// Project Actions

export async function createProject(prompt: string) {
    const db = getDb();
    const [project] = await db.insert(projects).values({
        name: prompt.length > 20 ? prompt.substring(0, 20) + '...' : prompt,
        description: prompt,
        nodes: [], // Start with empty canvas or generate initial state based on prompt
        edges: [],
    }).returning();

    redirect(`/projects/${project.id}`);
}

export async function getProjects() {
    const db = getDb();
    return await db.query.projects.findMany({
        orderBy: [desc(projects.createdAt)],
        limit: 10,
    });
}

export async function getProject(id: string) {
    const db = getDb();
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
    const db = getDb();
    await db.update(projects)
        .set({ nodes, edges })
        .where(eq(projects.id, id));
}

export async function updateProjectName(id: string, name: string) {
    const db = getDb();
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
    const db = getDb();

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
