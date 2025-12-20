import { graph } from '@/app/agent/graph';
import { HumanMessage } from '@langchain/core/messages';

export const maxDuration = 60;

export async function POST(req: Request) {
    const { messages, threadId } = await req.json();
    const lastMessage = messages[messages.length - 1];

    const stream = new ReadableStream({
        async start(controller) {
            try {
                const graphStream = await graph.stream({
                    messages: [new HumanMessage(lastMessage.content)],
                }, { configurable: { thread_id: threadId || 'default' } });

                for await (const event of graphStream) {
                    const [nodeName, stateUpdate] = Object.entries(event)[0] as [string, unknown];

                    if (nodeName !== 'chat') continue;

                    if (typeof stateUpdate !== 'object' || stateUpdate === null || !('messages' in stateUpdate)) continue;
                    const messagesValue = (stateUpdate as { messages?: unknown }).messages;
                    if (!Array.isArray(messagesValue) || messagesValue.length === 0) continue;

                    const maybeContent = (messagesValue[0] as { content?: unknown }).content;
                    if (typeof maybeContent !== 'string' || maybeContent.length === 0) continue;

                    controller.enqueue(new TextEncoder().encode(maybeContent));
                }
            } catch (e) {
                console.error(e);
            } finally {
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
        },
    });
}
