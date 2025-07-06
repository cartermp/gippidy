import { auth } from '@/app/(auth)/auth';
import {
  deleteDocumentsByIdAfterTimestamp,
  getDocumentsById,
  saveDocument,
} from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import { recordErrorOnCurrentSpan } from '@/lib/telemetry';
import { z } from 'zod';

const documentRequestSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string(),
  kind: z.enum(['text', 'code', 'image', 'sheet']),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError(
      'bad_request:api',
      'Parameter id is missing',
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:document').toResponse();
  }

  try {
    const documents = await getDocumentsById({ id });

    const [document] = documents;

    if (!document) {
      return new ChatSDKError('not_found:document').toResponse();
    }

    if (document.userId !== session.user.id) {
      return new ChatSDKError('forbidden:document').toResponse();
    }

    return Response.json(documents, { status: 200 });
  } catch (error) {
    recordErrorOnCurrentSpan(error as Error, {
      operation: 'get_document',
      'document.id': id,
    });
    throw error;
  }
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError(
      'bad_request:api',
      'Parameter id is required.',
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('not_found:document').toResponse();
  }

  let requestBody: z.infer<typeof documentRequestSchema>;
  try {
    const json = await request.json();
    requestBody = documentRequestSchema.parse(json);
  } catch (error) {
    return new ChatSDKError(
      'bad_request:api',
      'Invalid request body format',
    ).toResponse();
  }

  const { content, title, kind } = requestBody;

  const documents = await getDocumentsById({ id });

  if (documents.length > 0) {
    const [document] = documents;

    if (document.userId !== session.user.id) {
      return new ChatSDKError('forbidden:document').toResponse();
    }
  }

  try {
    const document = await saveDocument({
      id,
      content,
      title,
      kind,
      userId: session.user.id,
    });

    return Response.json(document, { status: 200 });
  } catch (error) {
    recordErrorOnCurrentSpan(error as Error, {
      operation: 'save_document',
      'document.id': id,
      'document.kind': kind,
    });
    throw error;
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const timestamp = searchParams.get('timestamp');

  if (!id) {
    return new ChatSDKError(
      'bad_request:api',
      'Parameter id is required.',
    ).toResponse();
  }

  if (!timestamp) {
    return new ChatSDKError(
      'bad_request:api',
      'Parameter timestamp is required.',
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:document').toResponse();
  }

  const documents = await getDocumentsById({ id });

  const [document] = documents;

  if (document.userId !== session.user.id) {
    return new ChatSDKError('forbidden:document').toResponse();
  }

  try {
    const documentsDeleted = await deleteDocumentsByIdAfterTimestamp({
      id,
      timestamp: new Date(timestamp),
    });

    return Response.json(documentsDeleted, { status: 200 });
  } catch (error) {
    recordErrorOnCurrentSpan(error as Error, {
      operation: 'delete_document_versions',
      'document.id': id,
      timestamp: timestamp,
    });
    throw error;
  }
}
