import { FileEntryIdSchema } from '@/shared/data/types/file';

import { restoreRemoteInput } from '../restoreRemoteInput';

it('restores text and valid attachments while identifying deleted and unreadable files', async () => {
  const ids = [1, 2, 3].map((n) =>
    FileEntryIdSchema.parse(`12345678-1234-4234-8234-123456789ab${n}`),
  );
  const result = await restoreRemoteInput(
    {
      parts: [
        { type: 'text', text: 'Keep my message' },
        ...ids.map((fileEntryId, index) => ({
          type: 'file' as const,
          fileEntryId,
          mediaType: 'application/pdf',
          name: `${index}.pdf`,
        })),
      ],
    },
    async (id) => {
      if (id === ids[0]) return 'file:///valid.pdf';
      if (id === ids[1]) return undefined;
      throw new Error('Read failed');
    },
  );
  expect(result.text).toBe('Keep my message');
  expect(result.attachments).toEqual([
    expect.objectContaining({ fileEntryId: ids[0], status: 'ready', uri: 'file:///valid.pdf' }),
  ]);
  expect(result.missing).toEqual(['1.pdf', '2.pdf']);
});
