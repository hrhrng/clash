'use client';

import { motion } from 'framer-motion';
import { Plus, CalendarBlank, Trash } from '@phosphor-icons/react';
import Link from 'next/link';
import { Project } from '@generated/client';
import { deleteProject, createProject } from '../actions';

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
                        onClick={async () => {
                            const prompt = window.prompt('Enter a name or description for your new video project:');
                            if (prompt) {
                                await createProject(prompt);
                            }
                        }}
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

                {/* Delete Button */}
                <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                        onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (confirm('Are you sure you want to delete this project?')) {
                                await deleteProject(project.id);
                            }
                        }}
                        className="rounded-full bg-white/90 p-2 text-slate-400 shadow-sm backdrop-blur-sm transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                        <Trash className="h-4 w-4" weight="bold" />
                    </button>
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
