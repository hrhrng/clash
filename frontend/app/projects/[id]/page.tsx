import { getProject } from '../../actions';
import ProjectEditor from '../../components/ProjectEditor';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ProjectPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ prompt?: string }>;
}) {
  const { id } = await params;
  const { prompt } = await searchParams;
  const project = await getProject(id);

  if (!project) {
    notFound();
  }

  return <ProjectEditor project={project} initialPrompt={prompt} />;
}
