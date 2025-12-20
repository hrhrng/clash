'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PaperPlaneRight, CaretLeft, CaretRight, Sparkle, Plus, ClockCounterClockwise } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { Command } from '../actions';
import { useChat } from '@ai-sdk/react';
import { UserMessage } from './copilot/UserMessage';
import { AgentCard, AgentLog } from './copilot/AgentCard';
import { ToolCall } from './copilot/ToolCall';
import { ApprovalCard } from './copilot/ApprovalCard';
import { NodeProposalCard, NodeProposal } from './copilot/NodeProposalCard';
import { ThinkingProcess } from './copilot/ThinkingProcess';
import { TodoList, TodoItem } from './copilot/TodoList';
import { ThinkingIndicator } from './copilot/ThinkingIndicator';
import { Node, Edge, Connection } from 'reactflow';
import ReactMarkdown from 'react-markdown';

interface Message {
    id: string;
    content: string;
    role: string;
    projectId: string;
    createdAt: Date;
}

interface ChatbotCopilotProps {
    projectId: string;
    initialMessages: Message[];
    onCommand?: (command: Command) => void;
    width: number;
    onWidthChange: (width: number) => void;
    isCollapsed: boolean;
    onCollapseChange: (collapsed: boolean) => void;
    selectedNodes?: Node[];
    onAddNode?: (type: string, extraData?: any) => string;
    onAddEdge?: (params: Edge | Connection) => void;
    onUpdateNode?: (nodeId: string, updates: Partial<Node>) => void;
    findNodeIdByName?: (name: string) => string | undefined;
    nodes?: Node[];
    edges?: Edge[];
    initialPrompt?: string;
}

export default function ChatbotCopilot({
    projectId,
    initialMessages,
    onCommand,
    width,
    onWidthChange,
    isCollapsed,
    onCollapseChange,
    selectedNodes = [],
    onAddNode,
    onAddEdge,
    onUpdateNode,
    findNodeIdByName,
    nodes = [],
    edges = [],
    initialPrompt
}: ChatbotCopilotProps) {
    const { messages, status, sendMessage } = useChat({
        initialMessages: initialMessages.map(m => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            createdAt: new Date(m.createdAt),
        })) as any,
    } as any);

    const [displayItems, setDisplayItems] = useState<any[]>([]);
    const [isAutoPilot, setIsAutoPilot] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingStatus, setProcessingStatus] = useState('Thinking');
    const isAutoPilotRef = useRef(isAutoPilot);

    useEffect(() => {
        isAutoPilotRef.current = isAutoPilot;
    }, [isAutoPilot]);

    const generateId = () => {
        return Date.now().toString() + Math.random().toString(36).substring(2, 9);
    };

    const [threadId, setThreadId] = useState<string>(() => generateId());
    const [sessionHistory, setSessionHistory] = useState<string[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [todoItems, setTodoItems] = useState<TodoItem[]>([]);

    // Typewriter effect state
    const [isTyping, setIsTyping] = useState(false);
    const textQueueRef = useRef<string>('');
    const typewriterIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const handleNewSession = () => {
        const newThreadId = generateId();
        if (messages.length > 0 || displayItems.length > 0) {
            setSessionHistory(prev => [...prev, threadId]);
        }
        setThreadId(newThreadId);
        setDisplayItems([]);
    };

    const handleHistoryClick = () => {
        setShowHistory(!showHistory);
    };

    // Sync initial messages to display items
    useEffect(() => {
        if (initialMessages.length > 0 && displayItems.length === 0) {
            setDisplayItems(initialMessages.map(m => ({
                type: 'message',
                role: m.role,
                content: m.content,
                id: m.id
            })));
        }
    }, [initialMessages]);

    // Flush remaining text immediately
    const flushTypewriter = useCallback(() => {
        if (textQueueRef.current.length > 0) {
            const remainingText = textQueueRef.current;
            textQueueRef.current = '';

            setDisplayItems(items => {
                const lastItem = items[items.length - 1];
                if (lastItem && lastItem.type === 'message' && lastItem.role === 'assistant') {
                    return items.map((item, index) =>
                        index === items.length - 1
                            ? { ...item, content: item.content + remainingText }
                            : item
                    );
                }
                return items;
            });
            setIsTyping(false);
        }
    }, []);

    const processTypewriterQueue = useCallback(() => {
        if (typewriterIntervalRef.current) return; // Already running

        setIsTyping(true);
        // Faster tick for smoother updates
        const TICK_DELAY = 10;

        typewriterIntervalRef.current = setInterval(() => {
            if (textQueueRef.current.length === 0) {
                if (typewriterIntervalRef.current) {
                    clearInterval(typewriterIntervalRef.current);
                    typewriterIntervalRef.current = null;
                }
                setIsTyping(false);
                return;
            }

            // Adaptive speed: if queue is long, render more chars per tick to catch up
            // Base speed: 1 char per 10ms (100 chars/sec)
            // If queue > 50 chars, speed up significantly
            const queueLength = textQueueRef.current.length;
            let charsToRender = 1;

            if (queueLength > 100) {
                charsToRender = 5; // Very fast catchup
            } else if (queueLength > 50) {
                charsToRender = 3; // Fast catchup
            } else if (queueLength > 20) {
                charsToRender = 2; // Moderate catchup
            }

            const chunk = textQueueRef.current.slice(0, charsToRender);
            textQueueRef.current = textQueueRef.current.slice(charsToRender);

            setDisplayItems(items => {
                const lastItem = items[items.length - 1];
                if (lastItem && lastItem.type === 'message' && lastItem.role === 'assistant') {
                    return items.map((item, index) =>
                        index === items.length - 1
                            ? { ...item, content: item.content + chunk }
                            : item
                    );
                }
                return items;
            });
        }, TICK_DELAY);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (typewriterIntervalRef.current) {
                clearInterval(typewriterIntervalRef.current);
            }
        };
    }, []);

    // Sync useChat messages to display items
    useEffect(() => {
        if (messages.length > 0) {
            // Simple sync for now - in real app we'd merge
            setDisplayItems(messages.map((m: any) => ({
                type: 'message',
                role: m.role,
                content: m.content,
                id: m.id
            })));
        }
    }, [messages]);

    const [input, setInput] = useState('');
    const [isResizing, setIsResizing] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const isLoading = status === 'streaming' || status === 'submitted';

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [shouldStickToBottom, setShouldStickToBottom] = useState(true);
    // Map agent name -> agent_id (delegation tool_call_id) so late events without agent_id can still attach
    const agentNameToIdRef = useRef<Record<string, string>>({});

    const scrollToBottom = () => {
        if (!shouldStickToBottom) return;
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleScroll = () => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        const nearBottom = distanceToBottom < 120; // small buffer so user control wins once they scroll up
        setShouldStickToBottom(nearBottom);
    };

    // Use ref to access current nodes inside stale closures (EventSource listeners)
    const nodesRef = useRef(nodes);
    useEffect(() => {
        nodesRef.current = nodes;
    }, [nodes]);

    const [pendingResume, setPendingResume] = useState<{
        userInput: string;
        resume: boolean;
        inputData: any;
        expectedNodeId?: string; // Wait for this node to exist
    } | null>(null);

    // Effect to handle pending resume after nodes update
    useEffect(() => {
        if (pendingResume) {
            // If we are waiting for a specific node, check if it exists
            if (pendingResume.expectedNodeId) {
                const nodeExists = nodes.some(n => n.id === pendingResume.expectedNodeId);
                if (!nodeExists) {
                    // Not ready yet, keep waiting
                    return;
                }
                console.log(`[ChatbotCopilot] Node ${pendingResume.expectedNodeId} found. Resuming stream...`);
            } else if (nodes.length === 0) {
                // If not waiting for specific node, but nodes are empty (unlikely in this flow but good safety), wait
                return;
            }

            console.log('[ChatbotCopilot] Resuming stream...', pendingResume);
            runStreamScenario(pendingResume.userInput, pendingResume.resume, pendingResume.inputData);
            setPendingResume(null);
        }
    }, [nodes, pendingResume]);

    // Helper to resolve name to ID using current nodes (via ref)
    const resolveName = (name: string) => {
        console.log(`[ChatbotCopilot] resolveName called for: "${name}"`);
        const currentNodes = nodesRef.current;
        console.log(`[ChatbotCopilot] Current nodes available (ref):`, currentNodes.map(n => ({ id: n.id, label: n.data?.label })));
        const node = currentNodes.find(n => n.data?.label === name);
        if (node) {
            console.log(`[ChatbotCopilot] Found match! ID: ${node.id}`);
        } else {
            console.warn(`[ChatbotCopilot] No match found for "${name}"`);
        }
        return node?.id;
    };

    const runStreamScenario = async (userInput: string, resume: boolean = false, inputData?: any) => {
        setIsProcessing(true);
        setProcessingStatus('Thinking');
        // 1. Add User Message (only if not resuming)
        if (!resume) {
            const userMsgId = generateId();
            setDisplayItems(prev => [...prev, {
                type: 'message',
                role: 'user',
                content: userInput,
                id: userMsgId
            }]);
        }


        // 3. Connect to SSE Stream
        console.log('[ChatbotCopilot] Connecting to SSE stream...');
        const url = new URL(`http://localhost:8000/api/v1/stream/${projectId}`);
        url.searchParams.append('thread_id', threadId);
        if (resume) {
            url.searchParams.append('resume', 'true');
        }
        // Always pass user_input; when resuming, encode the inputData payload, otherwise send the user prompt.
        const encodedUserInput = resume
            ? JSON.stringify(inputData ?? '')
            : (userInput ?? '');
        url.searchParams.append('user_input', encodedUserInput);

        const eventSource = new EventSource(url.toString());

        // Track if stream ended normally to suppress error on close
        let normalEnd = false;
        let retryCount = 0;
        const maxRetries = 3;
        let hasReceivedData = false;

        eventSource.onopen = () => {
            console.log('[ChatbotCopilot] SSE Stream connected successfully.');
            retryCount = 0; // Reset retry count on successful connection
        };

        eventSource.onerror = (e) => {
            // EventSource fires onerror on normal close - check if it's expected
            if (normalEnd) {
                console.log('[ChatbotCopilot] SSE Stream closed (expected).');
                return;
            }

            // Check readyState to determine if this is a real error
            if (eventSource.readyState === EventSource.CLOSED) {
                console.error('[ChatbotCopilot] SSE Stream closed unexpectedly.');

                // If we haven't received any data and hit max retries, show error
                if (!hasReceivedData && retryCount >= maxRetries) {
                    setDisplayItems(prev => [...prev, {
                        type: 'message',
                        role: 'assistant',
                        content: '❌ Unable to connect to the backend server. Please check if the server is running and try again.',
                        id: generateId()
                    }]);
                }

                eventSource.close();
                setIsProcessing(false);
            } else if (eventSource.readyState === EventSource.CONNECTING) {
                retryCount++;
                console.log(`[ChatbotCopilot] SSE Stream reconnecting... (attempt ${retryCount}/${maxRetries})`);

                // If exceeded max retries, force close
                if (retryCount > maxRetries) {
                    console.error('[ChatbotCopilot] Max retry attempts exceeded. Closing stream.');
                    setDisplayItems(prev => [...prev, {
                        type: 'message',
                        role: 'assistant',
                        content: '❌ Connection failed after multiple attempts. Please try again later.',
                        id: generateId()
                    }]);
                    eventSource.close();
                    setIsProcessing(false);
                }
            } else {
                console.warn('[ChatbotCopilot] SSE Stream unexpected state:', {
                    readyState: eventSource.readyState,
                    url: url.toString()
                });
                eventSource.close();
                setIsProcessing(false);
            }
        };

        eventSource.addEventListener('plan', (e: any) => {
            hasReceivedData = true;
            try {
                const data = JSON.parse(e.data);
                setTodoItems(data.items);
            } catch (err) {
                console.error('[ChatbotCopilot] Error parsing plan event:', err);
            }
        });

        eventSource.addEventListener('thinking', (e: any) => {
            hasReceivedData = true;
            console.log('[ChatbotCopilot] Received thinking:', e.data);
            try {
                const data = JSON.parse(e.data);
                const agentName = data.agent;
                const resolvedAgentId = data.agent_id || (agentName ? agentNameToIdRef.current[agentName] : undefined);

                // Only attach when we have a concrete agent_id to avoid mis-grouping
                if (resolvedAgentId) {
                    setDisplayItems(prev => {
                        // Find the LAST working agent card with this agentId (most recent task_delegation)
                        let existingIndex = -1;
                        for (let i = prev.length - 1; i >= 0; i--) {
                            if (prev[i].type === 'agent_card' &&
                                prev[i].props.agentId === resolvedAgentId) {
                                existingIndex = i;
                                break;
                            }
                        }

                        if (existingIndex !== -1) {
                            return prev.map((item, index) => {
                                if (index === existingIndex) {
                                return {
                                    ...item,
                                    props: {
                                        ...item.props,
                                        agentId: item.props.agentId || resolvedAgentId,
                                        logs: (() => {
                                            const existingLogs = (item.props.logs || []) as AgentLog[];
                                            // Check if the last log is a thinking block
                                            const lastLog = existingLogs[existingLogs.length - 1];
                                                if (lastLog && lastLog.type === 'thinking') {
                                                    // Merge with existing thinking block
                                                    return existingLogs.map((log: AgentLog, i: number) =>
                                                        i === existingLogs.length - 1
                                                            ? { ...log, content: log.content + '\n\n' + data.content }
                                                            : log
                                                    );
                                                } else {
                                                    // Create new thinking block
                                                    const newId = data.id ? `${data.id}-thinking` : `thinking-${generateId()}`;
                                                    return [...existingLogs, {
                                                        id: newId,
                                                        type: 'thinking',
                                                        content: data.content
                                                    }];
                                                }
                                            })()
                                        }
                                    };
                                }
                                return item;
                            });
                        } else {
                            return [...prev, {
                                type: 'agent_card',
                                id: `agent-${resolvedAgentId}`,
                                props: {
                                    agentId: resolvedAgentId,
                                    agentName: agentName,
                                    status: 'working',
                                    persona: agentName.toLowerCase(),
                                    logs: [{
                                        id: data.id || generateId(),
                                        type: 'thinking',
                                        content: data.content
                                    }]
                                }
                            }];
                        }
                    });
                    // Backfill mapping if missing
                    if (agentName && resolvedAgentId && agentNameToIdRef.current[agentName] !== resolvedAgentId) {
                        agentNameToIdRef.current[agentName] = resolvedAgentId;
                    }
                } else {
                    // Main agent thinking - merge consecutive thinking blocks into one
                    setDisplayItems(prev => {
                        const lastItem = prev[prev.length - 1];
                        // Check if last item is a thinking block AND from the same agent
                        if (lastItem && lastItem.type === 'thinking' && lastItem.agent === agentName) {
                            // Append to existing thinking block
                            return prev.map((item, index) =>
                                index === prev.length - 1
                                    ? { ...item, content: item.content + '\n' + data.content }
                                    : item
                            );
                        } else {
                            // Create new thinking block
                            return [...prev, {
                                type: 'thinking',
                                id: generateId() + '-thinking',
                                agent: agentName, // Track which agent this thinking belongs to
                                content: data.content
                            }];
                        }
                    });
                }
            } catch (err) {
                console.error('[ChatbotCopilot] Error parsing thinking event:', err);
            }
        });

        eventSource.addEventListener('text', (e: any) => {
            hasReceivedData = true;
            console.log('[ChatbotCopilot] Received text:', e.data);
            try {
                const data = JSON.parse(e.data);
                const agentName = data.agent;
                const resolvedAgentId = data.agent_id || (agentName ? agentNameToIdRef.current[agentName] : undefined);

                // Only process assistant messages
                if (agentName && agentName !== 'User') {
                    // Sub-agent text: rely on agent_id as the unique block id
                    if (resolvedAgentId) {
                        setDisplayItems(prev => {
                            const existingIndex = prev.findIndex(item =>
                                item.type === 'agent_card' &&
                                item.props.agentId === resolvedAgentId
                            );

                            if (existingIndex !== -1) {
                                return prev.map((item, index) => {
                                    if (index === existingIndex) {
                                        return {
                                            ...item,
                                            props: {
                                                ...item.props,
                                                agentId: item.props.agentId || resolvedAgentId,
                                                logs: (() => {
                                                    const existingLogs = (item.props.logs || []) as AgentLog[];
                                                    const lastLog = existingLogs[existingLogs.length - 1];
                                                    if (lastLog && lastLog.type === 'text') {
                                                        return existingLogs.map((log: AgentLog, i: number) =>
                                                            i === existingLogs.length - 1
                                                                ? { ...log, content: log.content + data.content }
                                                                : log
                                                        );
                                                    } else {
                                                        const newId = data.id ? `${data.id}-text` : `text-${generateId()}`;
                                                        return [...existingLogs, {
                                                            id: newId,
                                                            type: 'text',
                                                            content: data.content
                                                        }];
                                                    }
                                                })()
                                            }
                                        };
                                    }
                                    return item;
                                });
                            }

                            // Create a new agent card if it wasn't created yet
                            return [...prev, {
                                type: 'agent_card',
                                id: `agent-${resolvedAgentId}`,
                                props: {
                                    agentId: resolvedAgentId,
                                    agentName,
                                    status: 'working',
                                    persona: agentName.toLowerCase(),
                                    logs: [{
                                        id: data.id ? `${data.id}-text` : `text-${generateId()}`,
                                        type: 'text',
                                        content: data.content
                                    }]
                                }
                            }];
                        });
                        if (agentName && resolvedAgentId && agentNameToIdRef.current[agentName] !== resolvedAgentId) {
                            agentNameToIdRef.current[agentName] = resolvedAgentId;
                        }
                        return;
                    }

                    // No agent_id for sub-agent: ignore to avoid mis-append
                    if (agentName !== 'Director' && agentName !== 'Agent' && !resolvedAgentId) {
                        return;
                    }

                    // Director text (agent_id absent)
                    setDisplayItems(prev => {
                        const lastItem = prev[prev.length - 1];
                        if (!lastItem || lastItem.type !== 'message' || lastItem.role !== 'assistant') {
                            return [...prev, {
                                type: 'message',
                                role: 'assistant',
                                content: '',
                                id: generateId()
                            }];
                        }
                        return prev;
                    });

                    textQueueRef.current += data.content;
                    processTypewriterQueue();
                }
            } catch (err) {
                console.error('[ChatbotCopilot] Error parsing text event:', err);
            }
        });

        eventSource.addEventListener('tool_start', (e: any) => {
            console.log('[ChatbotCopilot] Received tool_start:', e.data);
            // Flush any pending typewriter text before showing tool
            flushTypewriter();

            try {
                const data = JSON.parse(e.data);
                const agentIdFromPayload = data.agent_id;
                if (data.tool === 'task_delegation' && data.input?.agent) {
                    setProcessingStatus(`${data.input.agent} is working...`);
                } else {
                    setProcessingStatus(`Running tool: ${data.tool}`);
                }

                // If agent is Director (or generic Agent), show standalone tool call
                // Check for 'Director', 'Agent', or 'agent'
                if (data.agent === 'Director' || data.agent === 'Agent' || data.agent === 'agent') {
                    // Special handling for task_delegation
                    if (data.tool === 'task_delegation') {
                        const targetAgent = data.input.agent;
                        const instruction = data.input.instruction;
                        const toolCallId = data.id || generateId();
                        // Use task_delegation tool_call_id as the AgentCard ID for precise matching
                        const agentCardId = `agent-${toolCallId}`;

                        setDisplayItems(prev => {
                            const newItems = [...prev];

                            // 1. Add the tool call (Director's action)
                            newItems.push({
                                type: 'tool_call',
                                id: toolCallId,
                                props: {
                                    toolName: data.tool,
                                    args: data.input,
                                    status: 'pending',
                                    indent: false
                                }
                            });

                            // 2. Always create a NEW AgentCard for each task_delegation
                            // Each task_delegation gets its own card, even if it's the same agent
                            newItems.push({
                                type: 'agent_card',
                                id: agentCardId,
                                props: {
                                    agentId: toolCallId,
                                    agentName: targetAgent,
                                    status: 'working',
                                    persona: targetAgent.toLowerCase(),
                                    logs: [],
                                    delegationId: toolCallId  // Store the delegation ID for matching
                                }
                            });

                            // Cache mapping for this agent name to delegation id
                            if (targetAgent && toolCallId) {
                                agentNameToIdRef.current[targetAgent] = toolCallId;
                            }

                            return newItems;
                        });
                        return;
                    }

                    setDisplayItems(prev => [...prev, {
                        type: 'tool_call',
                        id: data.id || generateId(),
                        props: {
                            toolName: data.tool,
                            args: data.input,
                            status: 'pending',
                            indent: false
                        }
                    }]);
                    return;
                }

                const agentId = agentIdFromPayload;

                // For now, we assume tool calls come from sub-agents like ScriptWriter
                // So we create/update the agent card
                setDisplayItems(prev => {
                    // Find the LAST working agent card with this agentId
                    let existingAgentIndex = -1;
                    for (let i = prev.length - 1; i >= 0; i--) {
                        if (prev[i].type === 'agent_card' &&
                            prev[i].props.agentId === agentId &&
                            prev[i].props.status === 'working') {
                            existingAgentIndex = i;
                            break;
                        }
                    }

                    if (existingAgentIndex !== -1) {
                        // Update existing agent card with new tool call log
                        return prev.map((item, index) => {
                            if (index === existingAgentIndex) {
                                return {
                                    ...item,
                                    props: {
                                        ...item.props,
                                        logs: (() => {
                                            const existingLogs = item.props.logs || [];
                                            const newId = data.id || generateId();
                                            if (existingLogs.some((l: AgentLog) => l.id === newId)) return existingLogs;
                                            return [...existingLogs, {
                                                id: newId,
                                                type: 'tool_call',
                                                toolProps: {
                                                    toolName: data.tool,
                                                    args: data.input,
                                                    status: 'pending',
                                                    indent: false
                                                }
                                            }];
                                        })()
                                    }
                                };
                            }
                            return item;
                        });
                    } else {
                        // Create new agent card with tool call log
                        return [...prev, {
                            type: 'agent_card',
                            id: agentId ? `agent-${agentId}` : generateId(),
                            props: {
                                agentId,
                                agentName: data.agent,
                                status: 'working',
                                persona: data.agent.toLowerCase(),
                                logs: [{
                                    id: data.id || generateId(),
                                    type: 'tool_call',
                                    toolProps: {
                                        toolName: data.tool,
                                        args: data.input,
                                        status: 'pending',
                                        indent: false
                                    }
                                }]
                            }
                        }];
                    }
                });
            } catch (err) {
                console.error('[ChatbotCopilot] Error parsing tool_start event:', err);
            }
        });

        eventSource.addEventListener('tool_end', (e: any) => {
            console.log('[ChatbotCopilot] Received tool_end:', e.data);
            try {
                const data = JSON.parse(e.data);
                console.log('[ChatbotCopilot] tool_end parsed:', { id: data.id, tool: data.tool, agent: data.agent, status: data.status });

                // Use status from backend (defaults to 'success' if not provided for backward compatibility)
                const toolStatus = data.status || 'success';

                // Reset status to agent working
                if (data.agent && data.agent !== 'User') {
                    setProcessingStatus(`${data.agent} is working...`);
                } else {
                    setProcessingStatus('Thinking...');
                }

                setDisplayItems(prev => {
                    console.log('[ChatbotCopilot] Current displayItems before tool_end update:', prev.map(item => ({
                        type: item.type,
                        id: item.id,
                        agentName: item.type === 'agent_card' ? item.props.agentName : undefined,
                        agentId: item.type === 'agent_card' ? item.props.agentId : undefined,
                        logs: item.type === 'agent_card' ? item.props.logs?.map((l: any) => ({ id: l.id, type: l.type, toolName: l.toolProps?.toolName })) : undefined
                    })));
                    return prev.map(item => {
                        // Handle standalone tool call (Director or Agent) - match by ID first, then fallback to tool name
                        if (item.type === 'tool_call') {
                            // Prioritize ID matching for exact identification
                            if (data.id && item.id === data.id) {
                                return {
                                    ...item,
                                    props: {
                                        ...item.props,
                                        status: toolStatus,
                                        result: data.result
                                    }
                                };
                            }
                        }

                        // Handle task_delegation completion
                        if (data.tool === 'task_delegation') {
                            // 1. Update the standalone tool call by ID
                            if (item.type === 'tool_call' && data.id && item.id === data.id) {
                                return {
                                    ...item,
                                    props: {
                                        ...item.props,
                                        status: toolStatus,
                                        result: data.result
                                    }
                                };
                            }

                            // 2. Update the corresponding AgentCard by delegationId
                            if (item.type === 'agent_card' && item.props.delegationId === data.id) {
                                return {
                                    ...item,
                                    props: {
                                        ...item.props,
                                        status: toolStatus === 'success' ? 'done' : 'failed'
                                    }
                                };
                            }

                            // 3. Update by agentId (delegation tool_call_id)
                            if (item.type === 'agent_card' && item.props.agentId === data.agent_id) {
                                return {
                                    ...item,
                                    props: {
                                        ...item.props,
                                        status: toolStatus === 'success' ? 'done' : 'failed'
                                    }
                                };
                            }
                        }

                        // Handle agent card tool calls - match by ID within logs
                        if (item.type === 'agent_card' && item.props.agentId === data.agent_id) {
                            return {
                                ...item,
                                props: {
                                    ...item.props,
                                    logs: item.props.logs?.map((log: any) => {
                                        // Match by ID first for exact identification
                                        if (log.type === 'tool_call' && data.id && log.id === data.id) {
                                            return {
                                                ...log,
                                                toolProps: {
                                                    ...log.toolProps,
                                                    status: toolStatus,
                                                    result: data.result
                                                }
                                            };
                                        }
                                        return log;
                                    })
                                }
                            };
                        }
                        return item;
                    });
                });
            } catch (err) {
                console.error('[ChatbotCopilot] Error parsing tool_end event:', err);
            }
        });

        eventSource.addEventListener('sub_agent_start', (e: any) => {
            console.log('[ChatbotCopilot] Received sub_agent_start:', e.data);
            try {
                const data = JSON.parse(e.data);
                const agentId = data.agent_id || data.id;
                const agentName = data.agent;
                const taskName = data.task;
                setProcessingStatus(`${agentName} is working`);
                setDisplayItems(prev => {
                    const existingIndex = prev.findIndex(item =>
                        item.type === 'agent_card' &&
                        (
                            (agentId && item.props.agentId === agentId) ||
                            (!agentId && item.props.agentName === agentName) ||
                            (!item.props.agentId && item.props.agentName === agentName)
                        )
                    );
                    if (existingIndex !== -1) {
                        return prev.map((item, index) => {
                            if (index === existingIndex) {
                                const logs = item.props.logs || [];
                                const lastLog = logs[logs.length - 1];
                                // Deduplicate if same task
                                if (lastLog && lastLog.taskName === taskName) {
                                    return {
                                        ...item,
                                        props: { ...item.props, status: 'working', agentId: item.props.agentId || agentId }
                                    };
                                }
                                return {
                                    ...item,
                                    props: {
                                        ...item.props,
                                        status: 'working',
                                        agentId: item.props.agentId || agentId,
                                        logs: (() => {
                                            const existingLogs = logs;
                                            // Deduplicate by ID if present
                                            if (data.id && existingLogs.some((l: AgentLog) => l.id === data.id)) return existingLogs;

                                            return [...existingLogs, {
                                                id: data.id || generateId(),
                                                type: 'text',
                                                taskName: taskName,
                                                content: <div className="text-blue-600 font-medium text-xs mt-2">Starting: {taskName}</div>
                                            }];
                                        })()
                                    }
                                };
                            }
                            return item;
                        });
                    } else {
                        return [...prev, {
                            type: 'agent_card',
                            id: `agent-${agentId || agentName}-${generateId()}`,
                            props: {
                                agentId,
                                agentName,
                                status: 'working',
                                persona: agentName.toLowerCase(),
                                logs: [{
                                    id: data.id || generateId(),
                                    type: 'text',
                                    taskName: taskName,
                                    content: <div className="text-blue-600 font-medium text-xs">Starting: {taskName}</div>
                                }]
                            }
                        }];
                    }
                });
            } catch (err) {
                console.error('[ChatbotCopilot] Error parsing sub_agent_start:', err);
            }
        });

        eventSource.addEventListener('sub_agent_end', (e: any) => {
            try {
                const data = JSON.parse(e.data);
                const agentId = data.agent_id || data.id;
                setDisplayItems(prev => prev.map(item => {
                    if (item.type === 'agent_card' &&
                        (
                            (agentId && item.props.agentId === agentId) ||
                            (!agentId && item.props.agentName === data.agent) ||
                            (!item.props.agentId && item.props.agentName === data.agent)
                        )) {
                        return {
                            ...item,
                            props: {
                                ...item.props,
                                status: 'done',
                                logs: [...(item.props.logs || []), {
                                    id: (data.id || generateId()) + '-end',
                                    type: 'text',
                                    content: <div className="text-green-600 font-medium text-xs mb-2">Completed: {data.result}</div>
                                }]
                            }
                        };
                    }
                    return item;
                }));
            } catch (err) {
                console.error('[ChatbotCopilot] Error parsing sub_agent_end:', err);
            }
        });

        eventSource.addEventListener('human_interrupt', (e: any) => {
            try {
                const data = JSON.parse(e.data);
                const approvalId = generateId() + '-approval';
                setDisplayItems(prev => [...prev, {
                    type: 'approval_card',
                    id: approvalId,
                    props: {
                        message: data.message,
                        onApprove: () => {
                            setDisplayItems(p => p.filter(i => i.id !== approvalId));
                            // Resume the stream with approval data
                            runStreamScenario('', true, { action: 'approve' });
                        },
                        onReject: () => {
                            setDisplayItems(p => p.filter(i => i.id !== approvalId));
                            // Resume the stream with reject data
                            runStreamScenario('', true, { action: 'reject' });
                        }
                    }
                }]);
                eventSource.close();
                setIsProcessing(false);
            } catch (err) {
                console.error('[ChatbotCopilot] Error parsing human_interrupt event:', err);
            }
        });

        eventSource.addEventListener('retry', () => {
            console.log('[ChatbotCopilot] Received retry event. Retrying in 2s...');
            normalEnd = true; // Suppress error on close
            eventSource.close();
            setTimeout(() => {
                // Resume stream (syncs new context)
                runStreamScenario('', true);
            }, 2000);
        });

        eventSource.addEventListener('workflow_error', (e: any) => {
            console.error('[ChatbotCopilot] Received workflow_error event:', e.data);
            try {
                const data = JSON.parse(e.data);
                setDisplayItems(prev => [...prev, {
                    type: 'message',
                    role: 'assistant',
                    content: `Error: ${data.message}`,
                    id: generateId()
                }]);
            } catch (err) {
                console.error('[ChatbotCopilot] Error parsing workflow_error event:', err);
            }
            normalEnd = true;
            eventSource.close();
            setIsProcessing(false);
        });

        eventSource.addEventListener('error', (e: Event) => {
            // This captures native EventSource connection errors
            if (normalEnd) {
                console.log('[ChatbotCopilot] SSE Stream closed (expected).');
                return;
            }

            console.warn('[ChatbotCopilot] SSE Stream connection error:', e);
            // Don't parse e.data here as it's a native event

            if (eventSource.readyState === EventSource.CLOSED) {
                console.log('[ChatbotCopilot] SSE Stream closed.');
            } else if (eventSource.readyState === EventSource.CONNECTING) {
                console.log('[ChatbotCopilot] SSE Stream reconnecting...');
            }
        });

        eventSource.addEventListener('end', () => {
            console.log('[ChatbotCopilot] Received end event. Closing stream.');
            normalEnd = true;
            eventSource.close();
            setIsProcessing(false);
        });

        // ========================================
        // REMOVED: node_proposal SSE listener
        // Node proposals are now handled via Loro CRDT sync
        // Agent writes directly to Loro's 'nodes' and 'edges' maps
        // Frontend listens to Loro document changes in ProjectEditor
        // See: apps/web/app/hooks/useLoroSync.ts
        // ========================================
        /* eventSource.addEventListener('node_proposal', (e: any) => {
            ... removed ~140 lines of node proposal handling code ...
        }); */

        // Handle rerun_generation_node events
        eventSource.addEventListener('rerun_generation_node', (e: any) => {
            hasReceivedData = true;
            try {
                const data = JSON.parse(e.data);
                console.log('[ChatbotCopilot] Received rerun_generation_node:', data);

                const { nodeId, assetId, nodeData } = data;

                if (!nodeId || !assetId) {
                    console.error('[ChatbotCopilot] Missing nodeId or assetId in rerun_generation_node event');
                    return;
                }

                // Find the ActionBadge node and trigger re-execution
                console.log('[ChatbotCopilot] Current nodes:', nodes.map((n: any) => ({ id: n.id, type: n.type, actionType: n.data?.actionType })));
                console.log('[ChatbotCopilot] Looking for nodeId:', nodeId);

                const targetNode = nodes.find((n: any) => n.id === nodeId);

                if (!targetNode) {
                    console.error(`[ChatbotCopilot] Node ${nodeId} not found`);
                    console.error('[ChatbotCopilot] Available node IDs:', nodes.map((n: any) => n.id));
                    return;
                }

                // Check if it's an action-badge node with actionType
                if (targetNode.type !== 'action-badge') {
                    console.error(`[ChatbotCopilot] Node ${nodeId} is not an action-badge node (type: ${targetNode.type})`);
                    return;
                }

                const actionType = targetNode.data?.actionType;
                if (actionType !== 'image-gen' && actionType !== 'video-gen') {
                    console.error(`[ChatbotCopilot] Node ${nodeId} is not a generation node (actionType: ${actionType})`);
                    return;
                }

                console.log(`[ChatbotCopilot] Triggering regeneration for node ${nodeId} with assetId ${assetId}`);

                // Update the node to trigger regeneration
                // We set preAllocatedAssetId and autoRun to trigger the ActionBadge's useEffect
                if (onUpdateNode) {
                    onUpdateNode(nodeId, {
                        data: {
                            ...targetNode.data,
                            preAllocatedAssetId: assetId,
                            autoRun: true, // Trigger auto-run
                        }
                    });
                } else {
                    console.error('[ChatbotCopilot] onUpdateNode callback not provided');
                }

            } catch (err) {
                console.error('[ChatbotCopilot] Error parsing rerun_generation_node event:', err);
            }
        });
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim()) return;

        const value = input;
        setInput('');
        setShouldStickToBottom(true);

        await runStreamScenario(value);
    };

    // Process data stream for commands - temporarily disabled as data is not available in useChat return
    /*
    useEffect(() => {
        if (!data) return;
        const lastData = data[data.length - 1] as any;
        if (lastData && lastData.type === 'command' && onCommand) {
             onCommand(lastData.command);
        }
    }, [data, onCommand]);
    */

    useEffect(() => {
        scrollToBottom();
    }, [messages, isCollapsed, displayItems, shouldStickToBottom]);

    // Auto-send initial prompt if provided (simplified approach)
    const hasAutoStartedRef = useRef(false);
    const router = useRouter();

    useEffect(() => {
        // If there's an initialPrompt and we haven't sent it yet
        if (initialPrompt && !hasAutoStartedRef.current) {
            hasAutoStartedRef.current = true;

            console.log('[ChatbotCopilot] Sending initial prompt:', initialPrompt);

            // Clear the URL parameter immediately to prevent re-sending on refresh
            router.replace(`/projects/${projectId}`, { scroll: false });

            // Delay to ensure component is fully mounted
            setTimeout(() => {
                // Send as normal message (resume=false)
                runStreamScenario(initialPrompt, false);
            }, 500);
        }
    }, [initialPrompt, projectId, router]); // Depend on necessary values

    const startResizing = () => {
        setIsResizing(true);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            e.preventDefault();
            const newWidth = window.innerWidth - e.clientX;
            const constrainedWidth = Math.max(300, Math.min(700, newWidth));
            onWidthChange(constrainedWidth);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.body.style.userSelect = '';
        };

        if (isResizing) {
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, onWidthChange]);

    return (
        <>
            <AnimatePresence>
                {isCollapsed && (
                    <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => onCollapseChange(false)}
                        className="absolute right-4 top-4 z-50 flex h-14 w-14 items-center justify-center rounded-lg border border-slate-200/60 bg-white/80 shadow-sm backdrop-blur-xl transition-all hover:shadow-md hover:bg-white/90"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        <CaretLeft className="w-5 h-5 text-slate-600" weight="bold" />
                    </motion.button>
                )}
            </AnimatePresence>

            <motion.div
                className={`h-full bg-white/60 backdrop-blur-xl flex flex-col relative ${isCollapsed ? '' : 'border-l border-white/20 shadow-2xl'}`}
                style={{ width: isCollapsed ? 0 : `${width}px` }}
                animate={{ width: isCollapsed ? 0 : width }}
                transition={isResizing ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
            >
                {!isCollapsed && (
                    <div
                        onMouseDown={startResizing}
                        className={`absolute left-0 top-0 bottom-0 w-0.5 cursor-ew-resize transition-colors z-10 ${isResizing ? 'bg-red-500' : 'hover:bg-red-500 bg-red-500/0'
                            }`}
                    />
                )}

                {!isCollapsed && (
                    <>
                        <motion.button
                            onClick={() => onCollapseChange(true)}
                            className="absolute left-2 top-4 z-20 p-2 flex items-center justify-center hover:bg-gray-100/50 rounded-lg transition-all"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                        >
                            <CaretRight className="w-5 h-5 text-gray-600" weight="bold" />
                        </motion.button>

                        {/* Session Controls */}
                        <div className="absolute right-4 top-4 z-20 flex items-center gap-1">
                            <motion.button
                                onClick={handleNewSession}
                                className="p-2 rounded-lg hover:bg-gray-100/50 text-slate-600 transition-colors"
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                title="New Session"
                            >
                                <Plus className="w-5 h-5" weight="bold" />
                            </motion.button>
                            <motion.button
                                onClick={handleHistoryClick}
                                className="p-2 rounded-lg hover:bg-gray-100/50 text-slate-600 transition-colors relative"
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                title="History"
                            >
                                <ClockCounterClockwise className="w-5 h-5" weight="bold" />
                                {sessionHistory.length > 0 && (
                                    <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white" />
                                )}
                            </motion.button>

                        </div>

                        {/* History Dropdown */}
                        <AnimatePresence>
                            {showHistory && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                    className="absolute top-14 right-4 z-30 w-64 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden"
                                >
                                    <div className="p-3 border-b border-slate-100 bg-slate-50">
                                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Session History</h3>
                                    </div>
                                    <div className="max-h-60 overflow-y-auto">
                                        {sessionHistory.length === 0 ? (
                                            <div className="p-4 text-center text-sm text-slate-400">No history yet</div>
                                        ) : (
                                            sessionHistory.map((id, index) => (
                                                <div
                                                    key={id}
                                                    className="px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 flex items-center justify-between group"
                                                    onClick={() => {
                                                        // In a real app, we would load this session
                                                        alert(`Load session: ${id}`);
                                                        setShowHistory(false);
                                                    }}
                                                >
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-medium text-slate-700">Session {index + 1}</span>
                                                        <span className="text-[10px] text-slate-400 font-mono">{id.slice(-6)}</span>
                                                    </div>
                                                    <CaretRight className="w-3 h-3 text-slate-300 group-hover:text-slate-500" />
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </>
                )
                }

                <AnimatePresence>
                    {!isCollapsed && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="h-full flex flex-col pt-16 relative"
                        >
                            <div
                                ref={scrollContainerRef}
                                onScroll={handleScroll}
                                className="absolute inset-0 top-16 overflow-y-auto px-6 pt-4 pb-32"
                            >
                                <div className="space-y-6">
                                    {displayItems.map((item: any) => (
                                        <motion.div
                                            key={item.id}
                                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                        >
                                            {item.type === 'message' && (
                                                item.role === 'user' ? (
                                                    <UserMessage content={item.content} />
                                                ) : (
                                                    <div className="text-base text-slate-800 leading-relaxed px-1 font-medium">
                                                        <ReactMarkdown
                                                            components={{
                                                                p: ({ children }: any) => <p className="mb-4 last:mb-0">{children}</p>,
                                                                ul: ({ children }: any) => <ul className="list-disc pl-4 mb-4 space-y-1">{children}</ul>,
                                                                ol: ({ children }: any) => <ol className="list-decimal pl-4 mb-4 space-y-1">{children}</ol>,
                                                                li: ({ children }: any) => <li className="mb-1">{children}</li>,
                                                                h1: ({ children }: any) => <h1 className="text-2xl font-bold mb-4 mt-6">{children}</h1>,
                                                                h2: ({ children }: any) => <h2 className="text-xl font-bold mb-3 mt-5">{children}</h2>,
                                                                h3: ({ children }: any) => <h3 className="text-lg font-bold mb-2 mt-4">{children}</h3>,
                                                                code: ({ className, children, ...props }: any) => {
                                                                    const match = /language-(\w+)/.exec(className || '');
                                                                    const isInline = !match && !String(children).includes('\n');
                                                                    return isInline ? (
                                                                        <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm font-mono text-pink-500 border border-slate-200" {...props}>
                                                                            {children}
                                                                        </code>
                                                                    ) : (
                                                                        <code className="block bg-slate-900 text-slate-50 p-4 rounded-lg mb-4 overflow-x-auto text-sm font-mono" {...props}>
                                                                            {children}
                                                                        </code>
                                                                    );
                                                                },
                                                                pre: ({ children }: any) => <pre className="not-prose mb-4">{children}</pre>,
                                                                blockquote: ({ children }: any) => <blockquote className="border-l-4 border-slate-200 pl-4 italic text-slate-500 mb-4">{children}</blockquote>,
                                                                a: ({ href, children }: any) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{children}</a>,
                                                            }}
                                                        >
                                                            {item.content}
                                                        </ReactMarkdown>
                                                    </div>
                                                )
                                            )}
                                            {item.type === 'agent_card' && (
                                                <AgentCard {...item.props} />
                                            )}
                                            {item.type === 'tool_call' && (
                                                <ToolCall {...item.props} />
                                            )}
                                            {item.type === 'approval_card' && (
                                                <ApprovalCard {...item.props} />
                                            )}
                                            {item.type === 'thinking' && (
                                                <ThinkingProcess content={item.content} />
                                            )}
                                            {item.type === 'node_proposal' && (
                                                <NodeProposalCard {...item.props} />
                                            )}
                                        </motion.div>
                                    ))}

                                    {isProcessing && (
                                        <ThinkingIndicator message={processingStatus} />
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>
                            </div>

                            {/* Selected Context Badge */}
                            <AnimatePresence>
                                {selectedNodes.length > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10, scale: 0.9 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.9 }}
                                        className="absolute bottom-[80px] right-6 z-20 pointer-events-auto"
                                    >
                                        <div className="bg-white/90 backdrop-blur-md text-slate-600 text-xs font-medium px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-2">
                                            <div className="flex -space-x-2">
                                                {selectedNodes.filter(n => n.data?.src).slice(0, 3).map((node) => (
                                                    <div key={node.id} className="w-6 h-6 rounded-md ring-2 ring-white overflow-hidden bg-slate-100">
                                                        <img src={node.data.src} alt="" className="w-full h-full object-cover" />
                                                    </div>
                                                ))}
                                            </div>
                                            <span>{selectedNodes.length} Selected</span>
                                            {selectedNodes.length === 1 && !selectedNodes[0].data?.src && (
                                                <span className="text-slate-400 border-l border-slate-200 pl-2 max-w-[100px] truncate">
                                                    {selectedNodes[0].data?.label || selectedNodes[0].type}
                                                </span>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Todo List Overlay */}
                            <AnimatePresence>
                                {todoItems.length > 0 && (
                                    <TodoList items={todoItems} />
                                )}
                            </AnimatePresence>

                            <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-gray-50 via-gray-50/60 to-transparent pointer-events-none" />

                            <div className="absolute bottom-0 left-0 right-0 px-4 py-4">
                                <form onSubmit={handleSubmit} className="flex gap-2">
                                    <input
                                        type="text"
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        placeholder={isProcessing ? "Agent is thinking..." : (selectedNodes.length > 0 ? "Ask anything about selected files..." : "Type your message...")}
                                        className={`flex-1 px-4 py-4 bg-white backdrop-blur-xl rounded-matrix focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white text-sm text-gray-900 placeholder:text-gray-500 border border-slate-200 transition-all shadow-sm hover:shadow-md ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        disabled={isLoading || isProcessing}
                                    />
                                    <motion.button
                                        type="submit"
                                        disabled={!input.trim() || isLoading || isProcessing}
                                        className={`px-4 py-4 rounded-matrix transition-all flex items-center justify-center ${input.trim() && !isProcessing
                                            ? 'bg-gray-900/90 text-white shadow-lg'
                                            : 'bg-gray-300/60 text-gray-400 cursor-not-allowed'
                                            }`}
                                        whileHover={input.trim() ? { scale: 1.05, y: -2 } : {}}
                                        whileTap={input.trim() ? { scale: 0.95 } : {}}
                                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                    >
                                        <PaperPlaneRight className="w-4 h-4" weight="fill" />
                                    </motion.button>
                                </form>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </>
    );
}
