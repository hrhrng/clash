'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PaperPlaneRight, CaretLeft, CaretRight, Sparkle, Plus, ClockCounterClockwise } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { Command } from '../actions';
import { useChat } from '@ai-sdk/react';
import { UserMessage } from './copilot/UserMessage';
import { AgentCard } from './copilot/AgentCard';
import { ToolCall } from './copilot/ToolCall';
import { ApprovalCard } from './copilot/ApprovalCard';
import { Node } from 'reactflow';

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
}

export default function ChatbotCopilot({
    projectId,
    initialMessages,
    onCommand,
    width,
    onWidthChange,
    isCollapsed,
    onCollapseChange,
    selectedNodes = []
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
    const [isDemoMode, setIsDemoMode] = useState(true);
    const [threadId, setThreadId] = useState<string>(() => Date.now().toString());
    const [sessionHistory, setSessionHistory] = useState<string[]>([]);
    const [showHistory, setShowHistory] = useState(false);

    const handleNewSession = () => {
        const newThreadId = Date.now().toString();
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

    // Sync useChat messages to display items (if not in demo mode or mixed)
    useEffect(() => {
        if (!isDemoMode && messages.length > 0) {
            // Simple sync for now - in real app we'd merge
            setDisplayItems(messages.map((m: any) => ({
                type: 'message',
                role: m.role,
                content: m.content,
                id: m.id
            })));
        }
    }, [messages, isDemoMode]);

    const [input, setInput] = useState('');
    const [isResizing, setIsResizing] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const isLoading = status === 'streaming' || status === 'submitted';

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const runDemoScenario = async (userInput: string) => {
        // 1. Add User Message
        const userMsgId = Date.now().toString();
        setDisplayItems(prev => [...prev, {
            type: 'message',
            role: 'user',
            content: userInput,
            id: userMsgId
        }]);

        // 2. Director Agent (Orchestrator) - Thinking
        const directorId = Date.now().toString() + '-director';
        setDisplayItems(prev => [...prev, {
            type: 'agent_card',
            id: directorId,
            props: {
                agentName: 'Director',
                status: 'working',
                persona: 'director',
                children: <div className="text-xs text-slate-500">Analyzing request and planning workflow...</div>
            }
        }]);

        await new Promise(resolve => setTimeout(resolve, 1500));

        // 3. Director Delegates to ScriptWriter
        setDisplayItems(prev => prev.map(item =>
            item.id === directorId
                ? { ...item, props: { ...item.props, status: 'done', children: <div className="text-xs text-slate-500">Plan approved. Delegating to <span className="text-indigo-600 font-medium">@ScriptWriter</span>.</div> } }
                : item
        ));

        // 4. ScriptWriter Agent - Working
        const scriptWriterId = Date.now().toString() + '-scriptwriter';
        setDisplayItems(prev => [...prev, {
            type: 'agent_card',
            id: scriptWriterId,
            props: {
                agentName: 'ScriptWriter',
                status: 'working',
                persona: 'scriptwriter',
                children: <div className="text-xs text-slate-500">Drafting script based on topic: "{userInput}"...</div>
            }
        }]);

        await new Promise(resolve => setTimeout(resolve, 2000));

        // 5. ScriptWriter Generates Script (Tool Call)
        const toolCallId = Date.now().toString() + '-tool';
        setDisplayItems(prev => [...prev, {
            type: 'tool_call',
            id: toolCallId,
            props: {
                toolName: 'generate_video_script',
                args: { topic: userInput },
                status: 'pending'
            }
        }]);

        await new Promise(resolve => setTimeout(resolve, 1500));

        // 6. Complete Tool Call & ScriptWriter
        setDisplayItems(prev => prev.map(item =>
            item.id === toolCallId
                ? { ...item, props: { ...item.props, status: 'success', result: "Script generated: 'In a world where AI...'" } }
                : item
        ));

        setDisplayItems(prev => prev.map(item =>
            item.id === scriptWriterId
                ? { ...item, props: { ...item.props, status: 'done', children: <div className="text-xs text-slate-500">Script completed. Sending back to Director.</div> } }
                : item
        ));

        // 7. Director Asks for Approval
        const approvalId = Date.now().toString() + '-approval';
        setDisplayItems(prev => [...prev, {
            type: 'approval_card',
            id: approvalId,
            props: {
                message: "ScriptWriter has finished. Ready to proceed with video generation?",
                onApprove: () => {
                    setDisplayItems(p => p.filter(i => i.id !== approvalId));

                    // Director delegates to VideoProducer
                    const videoProducerId = Date.now().toString() + '-videoproducer';
                    setDisplayItems(p => [...p, {
                        type: 'agent_card',
                        id: videoProducerId,
                        props: {
                            agentName: 'VideoProducer',
                            status: 'working',
                            persona: 'videoproducer',
                            children: <div className="text-xs text-slate-500">Generating video scenes...</div>
                        }
                    }]);
                },
                onReject: () => {
                    setDisplayItems(p => p.filter(i => i.id !== approvalId));
                    setDisplayItems(p => [...p, {
                        type: 'message',
                        role: 'assistant',
                        content: "Understood. What changes would you like to make to the script?",
                        id: Date.now().toString()
                    }]);
                }
            }
        }]);
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim()) return;

        const value = input;
        setInput('');

        if (isDemoMode) {
            await runDemoScenario(value);
        } else {
            await sendMessage({
                role: 'user',
                content: value,
            } as any, {
                body: {
                    threadId,
                    selectedContext: selectedNodes.map(node => ({
                        id: node.id,
                        type: node.type,
                        data: node.data
                    }))
                }
            });
        }
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
    }, [messages, isCollapsed, displayItems]);

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
                            <div className="absolute inset-0 top-16 overflow-y-auto px-6 pt-4 pb-32">
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
                                                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm text-sm">
                                                        {item.content}
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
                                        </motion.div>
                                    ))}

                                    {isLoading && !isDemoMode && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="flex justify-start"
                                        >
                                            <div className="bg-white border border-gray-200 px-4 py-3 rounded-matrix">
                                                <div className="flex items-center gap-1">
                                                    <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '0ms' }} />
                                                    <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '150ms' }} />
                                                    <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '300ms' }} />
                                                </div>
                                            </div>
                                        </motion.div>
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
                                        className="absolute bottom-[88px] right-6 z-20 pointer-events-auto"
                                    >
                                        <div className="bg-white/90 backdrop-blur-md text-slate-600 text-xs font-medium px-3 py-1.5 rounded-full border border-slate-200 shadow-sm flex items-center gap-2">
                                            <div className="flex -space-x-2">
                                                {selectedNodes.filter(n => n.data?.src).slice(0, 3).map((node) => (
                                                    <div key={node.id} className="w-6 h-6 rounded-full ring-2 ring-white overflow-hidden bg-slate-100">
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

                            <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-gray-50 via-gray-50/60 to-transparent pointer-events-none" />

                            <div className="absolute bottom-0 left-0 right-0 px-4 py-4">
                                <div className="bg-white/30 backdrop-blur-2xl rounded-matrix shadow-2xl p-3">
                                    <form onSubmit={handleSubmit} className="flex gap-2">
                                        <input
                                            type="text"
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            placeholder={selectedNodes.length > 0 ? "Ask anything about selected files..." : "Type your message..."}
                                            className="flex-1 px-4 py-3 bg-white/40 backdrop-blur-xl rounded-matrix focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:bg-white/60 text-sm text-gray-900 placeholder:text-gray-400 border-0 transition-all shadow-sm"
                                            disabled={isLoading && !isDemoMode}
                                        />
                                        <motion.button
                                            type="submit"
                                            disabled={!input.trim() || (isLoading && !isDemoMode)}
                                            className={`px-4 py-3 rounded-matrix transition-all flex items-center justify-center ${input.trim()
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
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </>
    );
}
