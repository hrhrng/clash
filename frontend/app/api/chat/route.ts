import { graph } from '@/app/agent/graph';
import { HumanMessage } from '@langchain/core/messages';
import { StreamData, LangChainAdapter } from 'ai';

export const maxDuration = 60;

export async function POST(req: Request) {
    const { messages, threadId } = await req.json();
    const lastMessage = messages[messages.length - 1];

    const data = new StreamData();

    const stream = new ReadableStream({
        async start(controller) {
            try {
                const graphStream = await graph.stream({
                    messages: [new HumanMessage(lastMessage.content)],
                }, { configurable: { thread_id: threadId || 'default' } });

                for await (const event of graphStream) {
                    const [nodeName, stateUpdate] = Object.entries(event)[0] as [string, any];

                    // Send agent status updates as data
                    if (nodeName === 'router') {
                        data.append({ type: 'agent_status', agent: 'Router', status: 'done', message: 'Routed request.' });
                    } else if (nodeName === 'generate_image') {
                        if (stateUpdate.messages && stateUpdate.messages.length > 0) {
                            const msg = stateUpdate.messages[0].content;
                            data.append({ type: 'agent_status', agent: 'Art Director', status: 'done', message: msg });
                        }
                    } else if (nodeName === 'generate_video') {
                        if (stateUpdate.messages && stateUpdate.messages.length > 0) {
                            const msg = stateUpdate.messages[0].content;
                            data.append({ type: 'agent_status', agent: 'Video Producer', status: 'done', message: msg });
                        }
                    } else if (nodeName === 'chat') {
                        if (stateUpdate.messages && stateUpdate.messages.length > 0) {
                            const msg = stateUpdate.messages[0].content;
                            // Stream the text content
                            controller.enqueue(new TextEncoder().encode(msg));
                        }
                    }

                    // Handle commands
                    if (stateUpdate.commands && stateUpdate.commands.length > 0) {
                        stateUpdate.commands.forEach((cmd: any) => {
                            data.append({ type: 'command', command: cmd });
                        });
                    }
                }
            } catch (e) {
                console.error(e);
            } finally {
                data.close();
                controller.close();
            }
        }
    });

    return new Response(stream.pipeThrough(data.stream), {
        headers: {
            'Content-Type': 'text/event-stream',
        },
    });
}
