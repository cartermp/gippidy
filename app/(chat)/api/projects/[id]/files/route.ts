import { auth } from '@/app/(auth)/auth';
import {
  addFileToProject,
  removeFileFromProject,
  getFilesByProject,
  getProjectById,
  getProjectFileById,
  updateProjectFile,
} from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import { recordErrorOnCurrentSpan } from '@/lib/telemetry';
import { z } from 'zod';

const addFileSchema = z.object({
  filename: z.string().min(1).max(255),
  filePath: z.string().optional(),
  fileType: z.string().max(100).optional(),
  content: z.string().optional(),
});

const updateFileSchema = z.object({
  filename: z.string().min(1).max(255).optional(),
  content: z.string().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:api').toResponse();
  }

  try {
    // Check if project exists and user has permission
    const project = await getProjectById({ id: projectId });

    if (!project) {
      return new ChatSDKError('not_found:api').toResponse();
    }

    if (project.userId !== session.user.id) {
      return new ChatSDKError('forbidden:api').toResponse();
    }

    const files = await getFilesByProject({ projectId });
    return Response.json(files, { status: 200 });
  } catch (error) {
    recordErrorOnCurrentSpan(error as Error, {
      operation: 'get_files_by_project',
      'project.id': projectId,
      'user.id': session.user.id,
    });
    throw error;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:api').toResponse();
  }

  let requestBody: z.infer<typeof addFileSchema>;
  try {
    const json = await request.json();
    requestBody = addFileSchema.parse(json);
  } catch (error) {
    return new ChatSDKError(
      'bad_request:api',
      'Invalid request body format',
    ).toResponse();
  }

  const { filename, filePath, fileType, content } = requestBody;

  try {
    // Check if project exists and user has permission
    const project = await getProjectById({ id: projectId });

    if (!project) {
      return new ChatSDKError('not_found:api').toResponse();
    }

    if (project.userId !== session.user.id) {
      return new ChatSDKError('forbidden:api').toResponse();
    }

    const [projectFile] = await addFileToProject({
      projectId,
      filename,
      filePath,
      fileType,
      content,
    });

    return Response.json(projectFile, { status: 201 });
  } catch (error) {
    recordErrorOnCurrentSpan(error as Error, {
      operation: 'add_file_to_project',
      'project.id': projectId,
      'file.name': filename,
      'user.id': session.user.id,
    });
    throw error;
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get('fileId');

  if (!fileId) {
    return new ChatSDKError(
      'bad_request:api',
      'Parameter fileId is required',
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:api').toResponse();
  }

  let requestBody: z.infer<typeof updateFileSchema>;
  try {
    const json = await request.json();
    requestBody = updateFileSchema.parse(json);
  } catch (error) {
    return new ChatSDKError(
      'bad_request:api',
      'Invalid request body format',
    ).toResponse();
  }

  const { filename, content } = requestBody;

  try {
    // Check if project exists and user has permission
    const project = await getProjectById({ id: projectId });

    if (!project) {
      return new ChatSDKError('not_found:api').toResponse();
    }

    if (project.userId !== session.user.id) {
      return new ChatSDKError('forbidden:api').toResponse();
    }

    // Check if file exists and belongs to the project
    const file = await getProjectFileById({ id: fileId });

    if (!file) {
      return new ChatSDKError('not_found:api').toResponse();
    }

    if (file.projectId !== projectId) {
      return new ChatSDKError('forbidden:api').toResponse();
    }

    const [updatedFile] = await updateProjectFile({
      id: fileId,
      filename,
      content,
    });

    return Response.json(updatedFile, { status: 200 });
  } catch (error) {
    recordErrorOnCurrentSpan(error as Error, {
      operation: 'update_project_file',
      'project.id': projectId,
      'file.id': fileId,
      'user.id': session.user.id,
    });
    throw error;
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get('fileId');

  if (!fileId) {
    return new ChatSDKError(
      'bad_request:api',
      'Parameter fileId is required',
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:api').toResponse();
  }

  try {
    // Check if project exists and user has permission
    const project = await getProjectById({ id: projectId });

    if (!project) {
      return new ChatSDKError('not_found:api').toResponse();
    }

    if (project.userId !== session.user.id) {
      return new ChatSDKError('forbidden:api').toResponse();
    }

    // Check if file exists and belongs to the project
    const file = await getProjectFileById({ id: fileId });

    if (!file) {
      return new ChatSDKError('not_found:api').toResponse();
    }

    if (file.projectId !== projectId) {
      return new ChatSDKError('forbidden:api').toResponse();
    }

    const [removedFile] = await removeFileFromProject({ id: fileId });

    return Response.json(removedFile, { status: 200 });
  } catch (error) {
    recordErrorOnCurrentSpan(error as Error, {
      operation: 'remove_file_from_project',
      'project.id': projectId,
      'file.id': fileId,
      'user.id': session.user.id,
    });
    throw error;
  }
}
