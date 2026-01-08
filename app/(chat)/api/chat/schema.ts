import { z } from 'zod';

const textPartSchema = z.object({
  text: z.string().min(1).max(2000),
  type: z.enum(['text']),
});

const attachmentSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(2000).optional(),
  contentType: z.string().min(1).max(200),
});

export const postRequestBodySchema = z.object({
  id: z.string().uuid(),
  message: z.object({
    id: z.string().uuid(),
    createdAt: z.coerce.date().optional(),
    role: z.enum(['user']),
    parts: z.array(textPartSchema),
    experimental_attachments: z.array(attachmentSchema).optional(),
  }),
  selectedVisibilityType: z.enum(['public', 'private']),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
