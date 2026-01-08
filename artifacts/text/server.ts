import { createDocumentHandler } from '@/lib/artifacts/server';

export const textDocumentHandler = createDocumentHandler<'text'>(
  {
    kind: 'text',
    onCreateDocument: async ({ title, dataStream }) => {
      const draftContent = `# ${title}\n\nDraft content will appear here.`;

      dataStream.writeData({
        type: 'text-delta',
        content: draftContent,
      });

      return draftContent;
    },
    onUpdateDocument: async ({ document, description, dataStream }) => {
      const draftContent = `${document.content ?? ''}\n\nUpdate requested: ${description}`;

      dataStream.writeData({
        type: 'text-delta',
        content: draftContent,
      });

      return draftContent;
    },
  },
);
