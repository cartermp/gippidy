import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/app/(auth)/auth';
import { recordErrorOnCurrentSpan } from '@/lib/telemetry';

const FileSchema = z.object({
  file: z
    .instanceof(File)
    .refine((file) => file.size <= 5 * 1024 * 1024, {
      message: 'File size should be less than 5MB',
    })
    .refine(
      (file) =>
        ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(
          file.type,
        ),
      {
        message: 'File type should be JPEG, PNG, GIF, or WebP',
      },
    ),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const validatedFile = FileSchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors
        .map((error) => error.message)
        .join(', ');

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    try {
      const data = await put(file.name, file, {
        access: 'public',
      });

      return NextResponse.json(data);
    } catch (error) {
      recordErrorOnCurrentSpan(error as Error, {
        operation: 'blob_upload',
        filename: file.name,
        'file.size': file.size,
      });
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
  } catch (error) {
    recordErrorOnCurrentSpan(error as Error, {
      operation: 'file_upload_request',
    });
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 },
    );
  }
}