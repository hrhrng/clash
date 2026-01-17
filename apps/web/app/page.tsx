/**
 * @file page.tsx
 * @description Main entry point for the Web application landing page.
 * @module apps.web.app
 *
 * @responsibility
 * - Fetches recent projects for the user (Server Component)
 * - Renders the client-side HomePageClient component
 * - Enforces dynamic rendering to ensure fresh data
 *
 * @exports
 * - HomePage: The async page component
 */
import { getProjects } from './actions';
import HomePageClient from './components/HomePageClient';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const projects = await getProjects(5);

  return <HomePageClient initialProjects={projects} />;
}
