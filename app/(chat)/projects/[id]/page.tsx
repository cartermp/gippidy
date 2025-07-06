import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '@/app/(auth)/auth';
import { getProjectById } from '@/lib/db/queries';
import { ProjectView } from '@/components/project-view';
import type { Project } from '@/lib/db/schema';

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    return {
      title: 'Project Not Found',
    };
  }

  try {
    const project = await getProjectById({ id });

    if (!project || project.userId !== session.user.id) {
      return {
        title: 'Project Not Found',
      };
    }

    return {
      title: `${project.name} - Chat Gippidy`,
      description: project.description || `Project: ${project.name}`,
    };
  } catch {
    return {
      title: 'Project Not Found',
    };
  }
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    notFound();
  }

  let project: Project | undefined;
  try {
    project = await getProjectById({ id });
  } catch {
    notFound();
  }

  if (!project || project.userId !== session.user.id) {
    notFound();
  }

  return <ProjectView project={project} user={session.user} />;
}
