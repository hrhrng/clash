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
    createdAt?: Date | string | null;
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
        <div className="w-full max-w-[1600px] mx-auto px-6 pb-24 mt-0">
            <div className="mb-8 flex items-center justify-between px-2">
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
                    const allAssets = project.assets || [];

                    // Sort assets: Images first, then by createdAt (newest first)
                    const displayAssets = [...allAssets]
                        .sort((a, b) => {
                            // 1. Prioritize images
                            if (a.type === 'image' && b.type !== 'image') return -1;
                            if (a.type !== 'image' && b.type === 'image') return 1;

                            // 2. Sort by createdAt (descending)
                            const dateA = new Date(a.createdAt || 0).getTime();
                            const dateB = new Date(b.createdAt || 0).getTime();
                            return dateB - dateA;
                        })
                        .slice(0, 4); // Take up to 4 assets

                    const assetCount = displayAssets.length;

                    // Determine grid columns based on count
                    // 1 asset -> full width
                    // 2 assets -> 2 columns, split vertically
                    // 3+ assets -> 2x2 grid (requires 3 or 4 items)
                    const gridClass = assetCount === 1 ? 'grid-cols-1' :
                                     assetCount === 2 ? 'grid-cols-2' :
                                     'grid-cols-2 grid-rows-2';

                    // Format Date
                    const date = new Date(project.updatedAt || new Date());
                    const formattedDate = new Intl.DateTimeFormat('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                    }).format(date);

                    return (
                    <Link key={project.id} href={`/projects/${project.id}`} className="block group">
                        <motion.div
                            className="relative aspect-video overflow-hidden rounded-[1.5rem] bg-gray-100 mb-4 transition-all hover:shadow-lg ring-1 ring-black/5"
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            {/* Asset Grid Logic */}
                            {assetCount === 0 ? (
                                /* No Assets - Empty State */
                                <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-gray-300">
                                   {/*  Placeholder or empty gray box as per screenshot */}
                                </div>
                            ) : (
                                /* Has Assets */
                                <div className={`grid h-full w-full ${gridClass} gap-[2px] bg-white`}>
                                    {displayAssets.map((asset: Asset) => (
                                        <div key={asset.id} className="relative overflow-hidden bg-gray-100">
                                            {asset.type === 'video' ? (
                                                <video
                                                    src={asset.url}
                                                    className="h-full w-full object-cover"
                                                    muted
                                                    loop
                                                    playsInline
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
                                    {/* Fill empty spots if we have 3 assets in a 4-grid slot (though current logic limits to 4, 3 assets would leave 1 empty) */}
                                    {assetCount === 3 && (
                                         <div className="bg-gray-100"></div>
                                    )}
                                </div>
                            )}
                        </motion.div>

                        {/* Text Content Below Card */}
                        <div className="px-1">
                            <h3 className="text-base font-semibold text-gray-900 group-hover:text-brand transition-colors">
                                {project.name || 'Untitled'}
                            </h3>
                            <p className="mt-1 text-xs text-gray-500">
                                {formattedDate}
                            </p>
                        </div>
                    </Link>
                )})}
            </div>
        </div>
    );
}
