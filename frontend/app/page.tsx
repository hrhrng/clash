import { getProjects } from './actions';
import HomePageClient from './components/HomePageClient';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const projects = await getProjects();

  return <HomePageClient initialProjects={projects} />;
}
