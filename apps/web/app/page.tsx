import { getProjects } from './actions';
import HomePageClient from './components/HomePageClient';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const projects = await getProjects(5);

  return <HomePageClient initialProjects={projects} />;
}
