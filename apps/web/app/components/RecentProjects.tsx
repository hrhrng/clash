'use client';

import { motion } from 'framer-motion';
import {
    PaperPlaneRight,
    Plus,
} from '@phosphor-icons/react';
import Link from 'next/link';
// Using a loose type here since the Drizzle result includes assets which might not be in the Prisma generated type
interface Asset {
    id: string;
    url: string;
    type: 'image' | 'video';
    storageKey: string;
}

interface ProjectWithAssets {
    id: string;
    name: string;
    updatedAt: Date | string | null;
    assets?: Asset[];
}

interface RecentProjectsProps {
    projects: any[]; // Relaxed type to accept Drizzle result with assets
}

export default function RecentProjects({ projects }: RecentProjectsProps) {
    return (
        <div className="w-full max-w-6xl mx-auto px-6 pb-24 mt-8">
            <div className="mb-10 flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight text-gray-900">Recent Projects</h2>
                <Link
                    href="/projects"
                    className="text-lg font-medium text-gray-500 transition-colors hover:text-brand"
                >
                    See All →
                </Link>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {/* Empty State Card / New Project */}
                <motion.button
                    className="group flex aspect-video flex-col items-center justify-center gap-4 rounded-[2rem] border-2 border-dashed border-gray-200 bg-gray-50 transition-all hover:border-brand/30 hover:bg-gray-100"
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
                {projects.map((project) => {
                    const assets = project.assets || [];
                    const assetCount = assets.length;

                    return (
                    <Link key={project.id} href={`/projects/${project.id}`}>
                        <motion.div
                            className="group relative aspect-video overflow-hidden rounded-[2rem] bg-gray-100 transition-all hover:shadow-xl ring-1 ring-black/5"
                            whileHover={{ y: -4 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            {/* Asset Grid Logic */}
                            {assetCount === 0 ? (
                                /* No Assets - Default View */
                                <div className="absolute inset-0 flex flex-col justify-between bg-white p-6 transition-colors group-hover:bg-gray-50">
                                    <div className="flex items-start justify-between">
                                        <span className="text-4xl">🎬</span>
                                        <div className="opacity-0 transition-opacity group-hover:opacity-100">
                                            <div className="rounded-full bg-white p-2 shadow-sm">
                                                <PaperPlaneRight className="h-5 w-5 text-gray-900" />
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="line-clamp-2 text-xl font-bold leading-tight tracking-tight text-gray-900 group-hover:text-brand transition-colors">
                                            {project.name}
                                        </h3>
                                        <p className="mt-2 text-sm font-medium text-gray-400">
                                            Last edited just now
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                /* Has Assets */
                                <div className="absolute inset-0 bg-white">
                                    {/* Grid Container */}
                                    <div className={`grid h-full w-full ${
                                        assetCount === 1 ? 'grid-cols-1' :
                                        assetCount === 2 ? 'grid-cols-2 gap-0.5' :
                                        'grid-cols-2 grid-rows-2 gap-0.5'
                                    } bg-gray-100`}>
                                        {assets.slice(0, 4).map((asset: Asset, index: number) => (
                                            <div key={asset.id} className="relative overflow-hidden bg-gray-200">
                                                {asset.type === 'video' ? (
                                                    <video
                                                        src={asset.url}
                                                        className="h-full w-full object-cover"
                                                        muted
                                                        loop
                                                        playsInline
                                                        // Auto play on hover could be cool, but keeping static for now or maybe poster
                                                    />
                                                ) : (
                                                    <img
                                                        src={asset.url}
                                                        alt="Asset"
                                                        className="h-full w-full object-cover"
                                                    />
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Overlay Gradient for Text Readability */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90 transition-opacity group-hover:opacity-100" />

                                    {/* Content Overlay */}
                                    <div className="absolute inset-0 flex flex-col justify-between p-6">
                                        <div className="flex items-start justify-end">
                                            <div className="translate-y-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                                                <div className="rounded-full bg-white/20 backdrop-blur-md p-2 text-white">
                                                    <PaperPlaneRight className="h-5 w-5" weight="fill" />
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <h3 className="line-clamp-2 text-xl font-bold leading-tight tracking-tight text-white shadow-black/20 drop-shadow-sm">
                                                {project.name}
                                            </h3>
                                            <p className="mt-1 text-sm font-medium text-white/70">
                                                {assetCount} assets
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </Link>
                )})}
            </div>
        </div>
    );
}
