import { createDocumentHandler } from '@/lib/artifacts/server';

export const sheetDocumentHandler = createDocumentHandler<'sheet'>(
  {
    kind: 'sheet',
    onCreateDocument: async ({ title, dataStream }) => {
      const draftContent = `title,notes\n${title},Draft data`;

      dataStream.writeData({
        type: 'sheet-delta',
        content: draftContent,
      });

      return draftContent;
    },
    onUpdateDocument: async ({ document, description, dataStream }) => {
      const baseContent = document.content ?? 'title,notes';
      const draftContent = `${baseContent}\nupdate,${description}`;

      dataStream.writeData({
        type: 'sheet-delta',
        content: draftContent,
      });

      return draftContent;
    },
  },
);
