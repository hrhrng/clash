'use client';

import { motion } from 'framer-motion';
import { Plus, Trash } from '@phosphor-icons/react';
import Link from 'next/link';
import { createProject, deleteProject } from '../actions';

interface Asset {
    id: string;
    url: string;
    type: 'image' | 'video';
    createdAt?: Date | string | number | null;
}

interface ProjectWithAssets {
    id: string;
    name: string;
    createdAt: Date | string | number;
    updatedAt: Date | string | number | null;
    assets?: Asset[];
}

interface ProjectsClientProps {
    projects: any[]; // Using relaxed type to accommodate Drizzle result with assets
}

export default function ProjectsClient({ projects }: ProjectsClientProps) {
    return (
        <div className="min-h-screen">
            <div className="mx-auto max-w-[1600px] px-6 py-24 mt-12">
                {/* Header */}
                <header className="mb-12 flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                            Video Projects
                        </h1>
                        <p className="mt-2 text-base text-gray-600">
                            Manage and track all your video creation projects
                        </p>
                    </div>
                </header>

                {/* Projects Grid */}
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {/* New Project Card */}
                    <motion.button
                        className="group flex aspect-video flex-col items-center justify-center gap-4 rounded-[2rem] border-2 border-dashed border-gray-200 bg-white/50 transition-all hover:border-brand/30 hover:bg-white"
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={async () => {
                            const prompt = window.prompt('Enter a name or description for your new video project:');
                            if (prompt) {
                                await createProject(prompt);
                            }
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

                    {projects.map((project) => (
                        <ProjectCard key={project.id} project={project} />
                    ))}
                </div>
            </div>
        </div>
    );
}

function ProjectCard({ project }: { project: ProjectWithAssets }) {
    // Format date
    const date = new Date(project.updatedAt || project.createdAt);
    const formattedDate = new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    }).format(date);

    // Asset Preview Logic
    const allAssets = project.assets || [];
    // Sort assets (images first, then new ones)
    const displayAssets = [...allAssets]
        .sort((a, b) => {
             // 1. Prioritize images
             if (a.type === 'image' && b.type !== 'image') return -1;
             if (a.type !== 'image' && b.type === 'image') return 1;

             // 2. Sort by createdAt (descending) - assuming createdAt might be available even if not in interface yet
             // @ts-ignore
             const dateA = new Date(a.createdAt || 0).getTime();
             // @ts-ignore
             const dateB = new Date(b.createdAt || 0).getTime();
             return dateB - dateA;
        })
        .slice(0, 4);

    const assetCount = displayAssets.length;
    const gridClass = assetCount === 1 ? 'grid-cols-1' :
                     assetCount === 2 ? 'grid-cols-2' :
                     'grid-cols-2 grid-rows-2';

    return (
        <Link href={`/projects/${project.id}`} className="block group">
            <motion.div
                className="relative aspect-video overflow-hidden rounded-[1.5rem] bg-gray-100 mb-4 transition-all hover:shadow-lg ring-1 ring-black/5"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
            >
                {assetCount === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-gray-300">
                        {/* Empty state */}
                    </div>
                ) : (
                    <div className={`grid h-full w-full ${gridClass} gap-[2px] bg-white`}>
                        {displayAssets.map((asset, index) => {
                            const isLastOfThree = assetCount === 3 && index === 2;
                            return (
                                <div key={asset.id} className={`relative overflow-hidden bg-gray-100 ${isLastOfThree ? 'col-span-2' : ''}`}>
                                    {/* Dashboard shows thumbnails directly - no special handling needed */}
                                    <img
                                        src={asset.url}
                                        alt="Asset"
                                        className="h-full w-full object-cover"
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Delete Button (Hover) */}
                <div className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100 z-10">
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
            </motion.div>

            {/* Text Content */}
            <div className="px-1">
                <h3 className="text-base font-semibold text-gray-900 group-hover:text-brand transition-colors truncate">
                    {project.name || 'Untitled'}
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                    {formattedDate}
                </p>
            </div>
        </Link>
    );
}
