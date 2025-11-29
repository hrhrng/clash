'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PaperPlaneRight, CaretLeft, CaretRight, Sparkle } from '@phosphor-icons/react';
import { sendMessage } from '../actions';
import { useRouter } from 'next/navigation';
import { Command } from '../actions';

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
}

export default function ChatbotCopilot({ projectId, initialMessages, onCommand }: ChatbotCopilotProps) {
    const [messages, setMessages] = useState<Message[]>(initialMessages);
    const [inputValue, setInputValue] = useState('');
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [width, setWidth] = useState(384); // 默认 384px (w-96)
    const [isResizing, setIsResizing] = useState(false);
    const [isPending, setIsPending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        setMessages(initialMessages);
    }, [initialMessages]);

    useEffect(() => {
        scrollToBottom();
    }, [messages, isCollapsed]);

    const handleSend = async () => {
        if (!inputValue.trim() || isPending) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            content: inputValue,
            role: 'user',
            projectId,
            createdAt: new Date(),
        };

        setMessages((prev) => [...prev, userMsg]);
        setInputValue('');
        setIsPending(true);

        try {
            const result = await sendMessage(projectId, userMsg.content);
            if (result.commands && onCommand) {
                result.commands.forEach(cmd => onCommand(cmd));
            }
            router.refresh();
        } catch (error) {
            console.error('Failed to send message:', error);
        } finally {
            setIsPending(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const startResizing = () => {
        setIsResizing(true);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;

            // 阻止文本选择
            e.preventDefault();

            // 从右向左调整宽度
            const newWidth = window.innerWidth - e.clientX;
            // 限制最小和最大宽度
            const constrainedWidth = Math.max(300, Math.min(700, newWidth));
            setWidth(constrainedWidth);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            // 恢复文本选择
            document.body.style.userSelect = '';
        };

        if (isResizing) {
            // 禁用文本选择
            document.body.style.userSelect = 'none';

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    return (
        <>
            {/* 收起状态的浮球 - 固定在右上角 */}
            <AnimatePresence>
                {isCollapsed && (
                    <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsCollapsed(false)}
                        className="fixed right-4 top-4 z-50 p-2 bg-white hover:bg-gray-100/50 rounded-lg shadow-md flex items-center justify-center transition-all"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                    >
                        <CaretLeft className="w-5 h-5 text-gray-600" weight="bold" />
                    </motion.button>
                )}
            </AnimatePresence>

            <motion.div
                className={`h-full bg-slate-50 flex flex-col relative ${isCollapsed ? '' : 'border-l border-slate-200'}`}
                style={{ width: isCollapsed ? 0 : `${width}px` }}
                animate={{ width: isCollapsed ? 0 : width }}
                transition={isResizing ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
            >
                {/* Resize Handle */}
                {!isCollapsed && (
                    <div
                        onMouseDown={startResizing}
                        className={`absolute left-0 top-0 bottom-0 w-0.5 cursor-ew-resize transition-colors z-10 ${isResizing ? 'bg-red-500' : 'hover:bg-red-500 bg-red-500/0'
                            }`}
                    />
                )}

                {/* Collapse Button - 只在展开时显示 */}
                {!isCollapsed && (
                    <motion.button
                        onClick={() => setIsCollapsed(true)}
                        className="absolute left-2 top-4 z-20 p-2 flex items-center justify-center hover:bg-gray-100/50 rounded-lg transition-all"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                    >
                        <CaretRight className="w-5 h-5 text-gray-600" weight="bold" />
                    </motion.button>
                )}

                <AnimatePresence>
                    {!isCollapsed && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="h-full flex flex-col pt-16 relative"
                        >
                            {/* Messages Area - 延伸到底部 */}
                            <div className="absolute inset-0 top-16 overflow-y-auto px-6 pt-4 pb-32">
                                <div className="space-y-3">
                                    <AnimatePresence>
                                        {messages.map((message) => (
                                            <motion.div
                                                key={message.id}
                                                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.95 }}
                                                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                            >
                                                <div className={`max-w-[82%] ${message.role === 'user' ? 'items-end' : ''}`}>
                                                    <motion.div
                                                        className={`px-4 py-3 rounded-matrix shadow-sm border ${message.role === 'assistant'
                                                            ? 'bg-white border-gray-200 text-gray-900'
                                                            : 'bg-gradient-to-br from-red-50 to-pink-50 border-red-100 text-gray-900'
                                                            }`}
                                                        whileHover={{ scale: 1.02, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                                                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                                    >
                                                        <p className="text-sm leading-relaxed">{message.content}</p>
                                                    </motion.div>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                    {isPending && (
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

                            {/* 渐变蒙版 - 在输入框下方 */}
                            <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-gray-50 via-gray-50/60 to-transparent pointer-events-none" />

                            {/* Input Area - 悬浮在底部的玻璃效果 */}
                            <div className="absolute bottom-0 left-0 right-0 px-4 py-4">
                                <div className="bg-white/30 backdrop-blur-2xl rounded-matrix shadow-2xl p-3">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={inputValue}
                                            onChange={(e) => setInputValue(e.target.value)}
                                            onKeyPress={handleKeyPress}
                                            placeholder="Type your message..."
                                            className="flex-1 px-4 py-3 bg-white/40 backdrop-blur-xl rounded-matrix focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:bg-white/60 text-sm text-gray-900 placeholder:text-gray-400 border-0 transition-all shadow-sm"
                                            disabled={isPending}
                                        />
                                        <motion.button
                                            onClick={handleSend}
                                            disabled={!inputValue.trim() || isPending}
                                            className={`px-4 py-3 rounded-matrix transition-all flex items-center justify-center ${inputValue.trim()
                                                ? 'bg-gray-900/90 text-white shadow-lg'
                                                : 'bg-gray-300/60 text-gray-400 cursor-not-allowed'
                                                }`}
                                            whileHover={inputValue.trim() ? { scale: 1.05, y: -2 } : {}}
                                            whileTap={inputValue.trim() ? { scale: 0.95 } : {}}
                                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                        >
                                            <PaperPlaneRight className="w-4 h-4" weight="fill" />
                                        </motion.button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </>
    );
}
