'use client';

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import {
    PaperPlaneRight,
    Plus,
    FilmSlate,
    Microphone,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { createProject } from '../actions';
import { Project } from '@generated/client';

interface HomePageClientProps {
    initialProjects: Project[];
}

export default function HomePageClient({ initialProjects }: HomePageClientProps) {
    const [inputValue, setInputValue] = useState('');
    const [isPending, startTransition] = useTransition();

    const handleSend = () => {
        if (inputValue.trim()) {
            startTransition(async () => {
                await createProject(inputValue);
            });
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="min-h-screen bg-white flex items-center">
            <div className="mx-auto w-full max-w-7xl px-12">
                {/* Hero Section with Chat Input */}
                <div className="mb-24 text-center">
                    <h1 className="mb-8 text-4xl font-bold tracking-tight text-gray-900">
                        What video are we creating today, 蛇皮?
                    </h1>

                    {/* Chat Input */}
                    <div className="mx-auto max-w-3xl">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
                            <textarea
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder="Describe your video idea... e.g., 'Create a 60-second product demo video with subtitles'"
                                className="w-full resize-none bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none"
                                rows={3}
                                disabled={isPending}
                            />
                            <div className="mt-3 flex items-center justify-between">
                                <div className="flex gap-2">
                                    <motion.button
                                        className="rounded-lg p-2 transition-colors hover:bg-gray-50"
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                    >
                                        <FilmSlate
                                            className="h-5 w-5 text-gray-600"
                                            weight="duotone"
                                        />
                                    </motion.button>
                                    <motion.button
                                        className="rounded-lg p-2 transition-colors hover:bg-gray-50"
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                    >
                                        <Microphone
                                            className="h-5 w-5 text-gray-600"
                                            weight="duotone"
                                        />
                                    </motion.button>
                                </div>
                                <motion.button
                                    onClick={handleSend}
                                    disabled={!inputValue.trim() || isPending}
                                    className={`flex items-center gap-2 rounded-lg px-4 py-2 transition-all ${inputValue.trim() && !isPending
                                        ? 'bg-gray-900 text-white shadow-md'
                                        : 'cursor-not-allowed bg-gray-200 text-gray-400'
                                        }`}
                                    whileHover={inputValue.trim() && !isPending ? { scale: 1.05 } : {}}
                                    whileTap={inputValue.trim() && !isPending ? { scale: 0.95 } : {}}
                                >
                                    <PaperPlaneRight className="h-4 w-4" weight="fill" />
                                    <span className="text-sm font-medium">
                                        {isPending ? 'Creating...' : 'Generate'}
                                    </span>
                                </motion.button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Recent Projects */}
                <div>
                    <div className="mb-6 flex items-center justify-between">
                        <h2 className="text-2xl font-bold text-gray-900">Recent Projects</h2>
                        <Link
                            href="/projects"
                            className="text-sm font-medium text-red-600 transition-colors hover:text-red-700"
                        >
                            See All →
                        </Link>
                    </div>

                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
                        {/* Empty State Card / New Project */}
                        <motion.button
                            className="group flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 transition-all hover:border-red-200 hover:bg-red-50"
                            whileHover={{ x: 2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => {
                                // Optional: focus input or open modal
                                document.querySelector('textarea')?.focus();
                            }}
                        >
                            <Plus
                                className="h-8 w-8 text-gray-400 transition-colors group-hover:text-red-500"
                                weight="bold"
                            />
                        </motion.button>

                        {/* Project Cards */}
                        {initialProjects.map((project) => (
                            <Link key={project.id} href={`/projects/${project.id}`}>
                                <motion.div
                                    className="group aspect-square cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-slate-100 transition-all hover:border-red-200"
                                    whileHover={{ x: 2 }}
                                    whileTap={{ scale: 0.98 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                >
                                    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4 text-center transition-all group-hover:from-red-50 group-hover:to-red-100">
                                        <span className="text-4xl mb-2">🎬</span>
                                        <span className="text-sm font-medium text-gray-700 line-clamp-2">
                                            {project.name}
                                        </span>
                                    </div>
                                </motion.div>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
