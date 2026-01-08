import { createDocumentHandler } from '@/lib/artifacts/server';

export const codeDocumentHandler = createDocumentHandler<'code'>(
  {
    kind: 'code',
    onCreateDocument: async ({ title, dataStream }) => {
      const draftContent = `// Draft for ${title}\n\nfunction placeholder() {\n  return '${title}';\n}`;

      dataStream.writeData({
        type: 'code-delta',
        content: draftContent,
      });

      return draftContent;
    },
    onUpdateDocument: async ({ document, description, dataStream }) => {
      const draftContent = `${document.content ?? ''}\n\n// Update requested: ${description}`;

      dataStream.writeData({
        type: 'code-delta',
        content: draftContent,
      });

      return draftContent;
    },
  },
);
