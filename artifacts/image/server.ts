import { createDocumentHandler } from '@/lib/artifacts/server';

export const imageDocumentHandler = createDocumentHandler<'image'>(
  {
    kind: 'image',
    onCreateDocument: async ({ title, dataStream }) => {
      const draftContent = `placeholder-image:${title}`;

      dataStream.writeData({
        type: 'image-delta',
        content: draftContent,
      });

      return draftContent;
    },
    onUpdateDocument: async ({ description, dataStream }) => {
      const draftContent = `placeholder-image:${description}`;

      dataStream.writeData({
        type: 'image-delta',
        content: draftContent,
      });

      return draftContent;
    },
  },
);
