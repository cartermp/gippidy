import { auth } from '@/app/(auth)/auth';
import {
  createProject,
  getProjectsByUserId,
  updateProject,
  deleteProject,
  getProjectById,
} from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import { recordErrorOnCurrentSpan } from '@/lib/telemetry';
import { z } from 'zod';

const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
});

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:api').toResponse();
  }

  try {
    const projects = await getProjectsByUserId({ userId: session.user.id });
    // Ensure we always return an array
    const projectsArray = Array.isArray(projects) ? projects : [];
    return Response.json(projectsArray, { status: 200 });
  } catch (error) {
    recordErrorOnCurrentSpan(error as Error, {
      operation: 'get_projects_by_user',
      'user.id': session.user.id,
    });
    // Even on error, return empty array instead of error for zero projects case
    console.error('Error in projects API, returning empty array:', error);
    return Response.json([], { status: 200 });
  }
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:api').toResponse();
  }

  let requestBody: z.infer<typeof createProjectSchema>;
  try {
    const json = await request.json();
    requestBody = createProjectSchema.parse(json);
  } catch (error) {
    return new ChatSDKError(
      'bad_request:api',
      'Invalid request body format',
    ).toResponse();
  }

  const { name, description } = requestBody;

  try {
    const [project] = await createProject({
      name,
      description,
      userId: session.user.id,
    });

    return Response.json(project, { status: 201 });
  } catch (error) {
    recordErrorOnCurrentSpan(error as Error, {
      operation: 'create_project',
      'project.name': name,
      'user.id': session.user.id,
    });
    throw error;
  }
}

export async function PATCH(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError(
      'bad_request:api',
      'Parameter id is required',
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:api').toResponse();
  }

  let requestBody: z.infer<typeof updateProjectSchema>;
  try {
    const json = await request.json();
    requestBody = updateProjectSchema.parse(json);
  } catch (error) {
    return new ChatSDKError(
      'bad_request:api',
      'Invalid request body format',
    ).toResponse();
  }

  const { name, description } = requestBody;

  try {
    // Check if project exists and user has permission
    const project = await getProjectById({ id });

    if (!project) {
      return new ChatSDKError('not_found:api').toResponse();
    }

    if (project.userId !== session.user.id) {
      return new ChatSDKError('forbidden:api').toResponse();
    }

    const [updatedProject] = await updateProject({
      id,
      name,
      description,
    });

    return Response.json(updatedProject, { status: 200 });
  } catch (error) {
    recordErrorOnCurrentSpan(error as Error, {
      operation: 'update_project',
      'project.id': id,
      'user.id': session.user.id,
    });
    throw error;
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError(
      'bad_request:api',
      'Parameter id is required',
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:api').toResponse();
  }

  try {
    // Check if project exists and user has permission
    const project = await getProjectById({ id });

    if (!project) {
      return new ChatSDKError('not_found:api').toResponse();
    }

    if (project.userId !== session.user.id) {
      return new ChatSDKError('forbidden:api').toResponse();
    }

    const [deletedProject] = await deleteProject({ id });

    return Response.json(deletedProject, { status: 200 });
  } catch (error) {
    recordErrorOnCurrentSpan(error as Error, {
      operation: 'delete_project',
      'project.id': id,
      'user.id': session.user.id,
    });
    throw error;
  }
}
