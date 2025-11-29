'use client';

import { memo, useState, useCallback, useEffect } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { TextT, X, Check } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';

// Dynamically import to avoid SSR issues
const MDEditor = dynamic(
    () => import('@uiw/react-md-editor'),
    { ssr: false }
);

const TextNode = ({ data, selected, id }: NodeProps) => {
    const [showModal, setShowModal] = useState(false);
    const [label, setLabel] = useState(data.label || 'Text Node');
    const [content, setContent] = useState(data.content || '# Hello World\nDouble click to edit.');
    const { setNodes } = useReactFlow();

    // Sync when data changes
    useEffect(() => {
        if (data.label) setLabel(data.label);
        if (data.content) setContent(data.content);
    }, [data.label, data.content]);

    const handleDoubleClick = useCallback(() => {
        setShowModal(true);
    }, []);

    const handleSave = useCallback(() => {
        setShowModal(false);
        // Update the node data
        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === id) {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            label,
                            content,
                        },
                    };
                }
                return node;
            })
        );
    }, [id, label, content, setNodes]);

    const handleCancel = useCallback(() => {
        setShowModal(false);
        // Reset to original values
        setLabel(data.label || 'Text Node');
        setContent(data.content || '# Hello World\nDouble click to edit.');
    }, [data.label, data.content]);

    const handleLabelChange = (evt: React.ChangeEvent<HTMLInputElement>) => {
        const newLabel = evt.target.value;
        setLabel(newLabel);
        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === id) {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            label: newLabel,
                        },
                    };
                }
                return node;
            })
        );
    };

    // Simple markdown preview component
    const MarkdownPreview = ({ content }: { content: string }) => {
        return (
            <div
                className="prose prose-lg max-w-none prose-slate prose-headings:font-bold prose-headings:text-slate-900 prose-p:text-slate-700 prose-a:text-purple-600 prose-code:text-purple-600 prose-code:bg-purple-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded"
                dangerouslySetInnerHTML={{
                    __html: content
                        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                        .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
                        .replace(/\*(.*)\*/gim, '<em>$1</em>')
                        .replace(/\n/gim, '<br />')
                }}
            />
        );
    };

    const [isEditing, setIsEditing] = useState(false);

    // Reset editing state when modal closes
    useEffect(() => {
        if (!showModal) {
            setIsEditing(false);
        }
    }, [showModal]);

    const modalContent = showModal ? (
        <AnimatePresence>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-8">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-white/80 backdrop-blur-sm"
                    onClick={handleCancel}
                />

                {/* Modal */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="relative z-10 w-full max-w-5xl h-[85vh] bg-[#FDFBF7] rounded-matrix shadow-2xl overflow-hidden flex flex-col border border-[#E5E5E5]"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-12 py-8 bg-[#FDFBF7]">
                        <div className="flex-1">
                            {isEditing ? (
                                <input
                                    className="w-full text-4xl font-bold text-[#333333] bg-transparent border-none focus:ring-0 placeholder:text-gray-300"
                                    value={label}
                                    onChange={handleLabelChange}
                                    placeholder="Page Title"
                                    autoFocus
                                />
                            ) : (
                                <h2 className="text-4xl font-bold text-[#333333]">{label}</h2>
                            )}
                        </div>

                        <div className="flex items-center gap-4 ml-8">
                            {isEditing ? (
                                <>
                                    <button
                                        onClick={() => setIsEditing(false)}
                                        className="px-6 py-3 text-base font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => {
                                            handleSave();
                                            setIsEditing(false);
                                        }}
                                        className="px-8 py-3 text-base font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-xl shadow-lg shadow-blue-500/20 transition-all transform hover:scale-105"
                                    >
                                        Save Changes
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={handleCancel}
                                        className="p-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                                    >
                                        <X className="w-6 h-6" weight="bold" />
                                    </button>
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="px-8 py-3 text-base font-medium text-[#333333] bg-white border border-gray-200 hover:bg-gray-50 rounded-xl shadow-sm transition-all"
                                    >
                                        Edit Page
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-hidden bg-[#FDFBF7]">
                        <div className="h-full overflow-y-auto px-12 pb-12">
                            <div className="max-w-4xl mx-auto h-full">
                                {isEditing ? (
                                    <div data-color-mode="light" className="h-full min-h-[500px]">
                                        <MDEditor
                                            value={content}
                                            onChange={(val) => setContent(val || '')}
                                            height="100%"
                                            preview="edit"
                                            className="!bg-transparent !border-none shadow-none"
                                            visibleDragbar={false}
                                            textareaProps={{
                                                placeholder: 'Start typing...'
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <div className="prose prose-xl max-w-none prose-slate prose-headings:font-bold prose-headings:text-[#333333] prose-p:text-gray-600 prose-a:text-blue-600 prose-img:rounded-2xl">
                                        <MarkdownPreview content={content} />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    ) : null;

    return (
        <>
            <div
                className="group relative w-[300px] h-[400px]"
                onDoubleClick={handleDoubleClick}
            >
                {/* Floating Title Input */}
                <div
                    className="absolute -top-8 left-4 z-10"
                    onDoubleClick={(e) => e.stopPropagation()}
                >
                    <input
                        className="bg-transparent text-lg font-bold text-slate-500 focus:text-slate-900 focus:outline-none"
                        value={label}
                        onChange={handleLabelChange}
                        placeholder="Text Node"
                    />
                </div>

                {/* Main Card */}
                <div className={`w-full h-full bg-[#FDFBF7] rounded-matrix flex flex-col overflow-hidden transition-all duration-300 hover:shadow-xl ${selected ? 'ring-4 ring-blue-500 ring-offset-2' : 'ring-1 ring-slate-200'
                    }`}>
                    {/* Card Content */}
                    <div className="flex-1 p-8 flex flex-col relative">
                        {/* Content Preview with Fade Out */}
                        <div className="flex-1 relative overflow-hidden">
                            <div className="absolute inset-0 mask-image-linear-gradient-to-b">
                                <div className="prose prose-slate prose-p:text-gray-600 prose-headings:text-gray-800">
                                    <MarkdownPreview content={content} />
                                </div>
                            </div>

                            {/* Fade out gradient overlay */}
                            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#FDFBF7] to-transparent pointer-events-none" />
                        </div>
                    </div>
                </div>

                <Handle
                    type="target"
                    position={Position.Left}
                    className="!h-4 !w-4 !-translate-x-2 !border-4 !border-white !bg-blue-500 transition-all hover:scale-125 shadow-sm"
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    className="!h-4 !w-4 !translate-x-2 !border-4 !border-white !bg-blue-500 transition-all hover:scale-125 shadow-sm"
                />
            </div>

            {/* Render modal in portal */}
            {typeof window !== 'undefined' && modalContent && createPortal(modalContent, document.body)}
        </>
    );
};

export default memo(TextNode);
