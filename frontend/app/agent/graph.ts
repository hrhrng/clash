import { StateGraph, END } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { z } from 'zod';

// Define Command types matching actions.ts
export type CommandType = 'ADD_NODE' | 'ADD_EDGE' | 'UPDATE_NODE' | 'DELETE_NODE';

export interface Command {
    type: CommandType;
    payload: any;
}

// Define the Agent State
export interface AgentState {
    messages: BaseMessage[];
    commands: Command[];
    next?: string;
}

import { GoogleAIGC } from './aigc';

// Initialize Models
const gemini3 = new ChatGoogleGenerativeAI({
    model: 'gemini-3.0-pro-preview-001',
    apiKey: process.env.GOOGLE_API_KEY,
});

const aigc = new GoogleAIGC();

// Router Node
const routerNode = async (state: AgentState) => {
    const lastMessage = state.messages[state.messages.length - 1];
    const content = lastMessage.content as string;
    const lowerContent = content.toLowerCase();

    let next = 'chat';
    if (lowerContent.includes('generate image') || lowerContent.includes('create image')) {
        next = 'generate_image';
    } else if (lowerContent.includes('generate video') || lowerContent.includes('create video')) {
        next = 'generate_video';
    }

    return { next };
};

// Chat Node
const chatNode = async (state: AgentState) => {
    const lastMessage = state.messages[state.messages.length - 1];
    const content = lastMessage.content as string;

    const systemPrompt = `
    You are an AI Copilot for a node-based video editor. 
    The user wants to perform an action on the canvas.
    Translate their request into a JSON object with two fields:
    1. "text": A friendly response to the user.
    2. "commands": An array of commands to execute.

    Available commands:
    - ADD_NODE: { type: "ADD_NODE", payload: { type: "default", data: { label: string, mediaType?: 'video' | 'image' | 'audio' }, position: { x: number, y: number } } }
    - ADD_EDGE: { type: "ADD_EDGE", payload: { source: string, target: string } }

    Current canvas context: (Empty for now)

    User Request: "${content}"

    Output ONLY valid JSON.
    `;

    const response = await gemini3.invoke([new HumanMessage(systemPrompt)]);
    const text = response.content as string;
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsed = { text: "I'm sorry, I couldn't process that.", commands: [] };
    try {
        parsed = JSON.parse(cleanJson);
    } catch (e) {
        console.error("JSON Parse Error", e);
    }

    return {
        messages: [new AIMessage(parsed.text)],
        commands: parsed.commands || [],
    };
};

// Image Generation Node
const generateImageNode = async (state: AgentState) => {
    const lastMessage = state.messages[state.messages.length - 1];
    const content = lastMessage.content as string;

    const result = await aigc.generateImage(content);

    return {
        messages: [new AIMessage(result.text)],
        commands: result.commands,
    };
};

// Video Generation Node
const generateVideoNode = async (state: AgentState) => {
    const lastMessage = state.messages[state.messages.length - 1];
    const content = lastMessage.content as string;

    const result = await aigc.generateVideo(content);

    return {
        messages: [new AIMessage(result.text)],
        commands: result.commands,
    };
};

// Define Graph
const workflow = new StateGraph<AgentState>({
    channels: {
        messages: {
            reducer: (a: BaseMessage[], b: BaseMessage[]) => a.concat(b),
            default: () => [],
        },
        commands: {
            reducer: (a: Command[], b: Command[]) => b, // Replace commands
            default: () => [],
        },
        next: {
            reducer: (a: string | undefined, b: string | undefined) => b,
            default: () => undefined,
        }
    }
})
    .addNode('router', routerNode)
    .addNode('chat', chatNode)
    .addNode('generate_image', generateImageNode)
    .addNode('generate_video', generateVideoNode)
    .addEdge('router', 'chat') // Default edge, but we use conditional
    .setEntryPoint('router');

// Conditional edges
workflow.addConditionalEdges(
    'router',
    (state) => state.next || 'chat',
    {
        chat: 'chat',
        generate_image: 'generate_image',
        generate_video: 'generate_video',
    }
);

workflow.addEdge('chat', END);
workflow.addEdge('generate_image', END);
workflow.addEdge('generate_video', END);

export const graph = workflow.compile();
