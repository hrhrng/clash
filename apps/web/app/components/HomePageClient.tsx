'use client';

import { Project } from '@generated/client';
import HeroSection from './HeroSection';
import RecentProjects from './RecentProjects';

interface HomePageClientProps {
    initialProjects: Project[];
}

export default function HomePageClient({ initialProjects }: HomePageClientProps) {
    return (
        <div className="text-gray-900">
            <HeroSection />
            <RecentProjects projects={initialProjects} />
        </div>
    );
}
