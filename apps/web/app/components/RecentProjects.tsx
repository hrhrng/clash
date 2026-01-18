'use client';

import { motion } from 'framer-motion';
import {
    PaperPlaneRight,
    Plus,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { Project } from '@generated/client';

interface RecentProjectsProps {
    projects: Project[];
}

export default function RecentProjects({ projects }: RecentProjectsProps) {
    return (
        <div className="w-full max-w-6xl mx-auto px-6 pb-24">
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
                        // Focus the textarea in the HeroSection
                        document.querySelector('textarea')?.focus();
                        // Scroll to top to ensure textarea is visible
                        window.scrollTo({ top: 0, behavior: 'smooth' });
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
                {projects.map((project) => (
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
    );
}
