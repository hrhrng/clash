'use client';

import { motion } from 'framer-motion';
import { Plus, CalendarBlank } from '@phosphor-icons/react';
import Link from 'next/link';
import { Project } from '@generated/client';

interface ProjectsClientProps {
    projects: Project[];
}

export default function ProjectsClient({ projects }: ProjectsClientProps) {
    return (
        <div className="min-h-screen bg-white">
            <div className="mx-auto max-w-7xl px-12 py-16">
                {/* Header */}
                <header className="mb-12 flex items-start justify-between">
                    <div>
                        <h1 className="mb-2 text-4xl font-bold text-gray-900">
                            Video Projects
                        </h1>
                        <p className="text-base text-gray-600">
                            Manage and track all your video creation projects
                        </p>
                    </div>
                    {/* Button removed as per user request */}
                </header>

                {/* Projects Grid */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {/* Empty State Card */}
                    <motion.button
                        className="group flex h-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 transition-all hover:border-red-200 hover:bg-red-50"
                        whileHover={{ x: 2 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        <Plus
                            className="mb-3 h-12 w-12 text-gray-400 transition-colors group-hover:text-red-500"
                            weight="bold"
                        />
                        <span className="text-sm font-medium text-gray-500 transition-colors group-hover:text-red-600">
                            Create New Video
                        </span>
                    </motion.button>

                    {projects.map((project) => (
                        <ProjectCard key={project.id} project={project} />
                    ))}
                </div>
            </div>
        </div>
    );
}

function ProjectCard({ project }: { project: Project }) {
    // Format date
    const date = new Date(project.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    });

    // Default thumbnail or derive from project
    const thumbnail = "🎬";

    return (
        <Link href={`/projects/${project.id}`}>
            <motion.div
                className="group cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-white transition-all hover:border-red-200"
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
                {/* Thumbnail */}
                <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-6xl transition-all group-hover:from-red-50 group-hover:to-red-100">
                    {thumbnail}
                </div>

                {/* Content */}
                <div className="p-4">
                    <h3 className="mb-2 text-base font-bold text-gray-900">{project.name}</h3>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                        <CalendarBlank className="h-4 w-4" weight="duotone" />
                        <span>{date}</span>
                    </div>
                </div>
            </motion.div>
        </Link>
    );
}
