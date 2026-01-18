'use client';

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import {
    PaperPlaneRight,
    Plus,
    FilmSlate,
    Microphone,
    Sparkle
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
        <div className="text-gray-900 p-6 md:p-12">
            <div className="mx-auto max-w-6xl">
                {/* Hero Section with Chat Input */}
                <div className="mb-24 pt-12">
                    <motion.h1
                        className="mb-12 text-6xl md:text-7xl font-bold tracking-tighter text-gray-900"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        Hey! <br />
                        Let's make some <span className="text-brand">CLASH?</span>
                    </motion.h1>

                    {/* Chat Input - Gemini Style */}
                    <div className="max-w-4xl">
                        <div className="group relative rounded-[2rem] border border-gray-200 bg-white p-2 shadow-sm transition-all duration-300 hover:shadow-md focus-within:shadow-xl focus-within:border-gray-300">
                            <textarea
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder="Describe your video idea... e.g., 'Create a 60-second product demo video with subtitles'"
                                className="w-full resize-none rounded-2xl bg-transparent px-6 py-4 text-xl text-gray-900 placeholder:text-gray-400 focus:outline-none"
                                rows={3}
                                disabled={isPending}
                            />
                            <div className="flex items-center justify-between px-4 pb-2">
                                <div className="flex gap-2">
                                    <motion.button
                                        className="rounded-full p-3 transition-colors hover:bg-gray-100"
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                    >
                                        <FilmSlate
                                            className="h-6 w-6 text-gray-500"
                                            weight="regular"
                                        />
                                    </motion.button>
                                    <motion.button
                                        className="rounded-full p-3 transition-colors hover:bg-gray-100"
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                    >
                                        <Microphone
                                            className="h-6 w-6 text-gray-500"
                                            weight="regular"
                                        />
                                    </motion.button>
                                </div>
                                <motion.button
                                    onClick={handleSend}
                                    disabled={!inputValue.trim() || isPending}
                                    className={`flex items-center gap-2 rounded-full px-6 py-3 transition-all ${inputValue.trim() && !isPending
                                        ? 'bg-gray-900 text-white shadow-lg hover:bg-brand'
                                        : 'cursor-not-allowed bg-gray-100 text-gray-400'
                                        }`}
                                    whileHover={inputValue.trim() && !isPending ? { scale: 1.05 } : {}}
                                    whileTap={inputValue.trim() && !isPending ? { scale: 0.95 } : {}}
                                >
                                    {isPending ? (
                                        <Sparkle className="h-5 w-5 animate-spin" weight="fill" />
                                    ) : (
                                        <PaperPlaneRight className="h-5 w-5" weight="fill" />
                                    )}
                                    <span className="text-base font-medium">
                                        {isPending ? 'Creating...' : 'Generate'}
                                    </span>
                                </motion.button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Recent Projects */}
                <div>
                    <div className="mb-10 flex items-center justify-between">
                        <h2 className="text-3xl font-bold tracking-tight text-gray-900">Recent Projects</h2>
                        <Link
                            href="/projects"
                            className="text-lg font-medium text-gray-500 transition-colors hover:text-brand"
                        >
                            See All →
                        </Link>
                    </div>

                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {/* Empty State Card / New Project */}
                        <motion.button
                            className="group flex aspect-[4/3] flex-col items-center justify-center gap-4 rounded-[2rem] border-2 border-dashed border-gray-200 bg-gray-50 transition-all hover:border-brand/30 hover:bg-gray-100"
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => {
                                document.querySelector('textarea')?.focus();
                            }}
                        >
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm transition-transform group-hover:scale-110">
                                <Plus
                                    className="h-8 w-8 text-gray-400 transition-colors group-hover:text-brand"
                                    weight="bold"
                                />
                            </div>
                            <span className="text-lg font-medium text-gray-500 group-hover:text-gray-900">New Project</span>
                        </motion.button>

                        {/* Project Cards */}
                        {initialProjects.map((project) => (
                            <Link key={project.id} href={`/projects/${project.id}`}>
                                <motion.div
                                    className="group relative aspect-[4/3] overflow-hidden rounded-[2rem] bg-gray-100 transition-all hover:shadow-xl"
                                    whileHover={{ y: -4 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    <div className="absolute inset-0 flex flex-col justify-between bg-white p-8 transition-colors group-hover:bg-gray-50">
                                        <div className="flex items-start justify-between">
                                            <span className="text-5xl">🎬</span>
                                            <div className="opacity-0 transition-opacity group-hover:opacity-100">
                                                <div className="rounded-full bg-white p-2 shadow-sm">
                                                    <PaperPlaneRight className="h-5 w-5 text-gray-900" />
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <h3 className="line-clamp-2 text-2xl font-bold leading-tight tracking-tight text-gray-900 group-hover:text-brand transition-colors">
                                                {project.name}
                                            </h3>
                                            <p className="mt-2 text-sm font-medium text-gray-400">
                                                Last edited just now
                                            </p>
                                        </div>
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
