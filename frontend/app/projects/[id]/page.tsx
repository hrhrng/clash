import { getProject } from '../../actions';
import ProjectEditor from '../../components/ProjectEditor';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);

  if (!project) {
    notFound();
  }

  return <ProjectEditor project={project} />;
}
