import type { ComposerSendPayload } from '@/frontend/components/composer';
import { FileEntryIdSchema } from '@/shared/data/types/file';

import { toAgentInputParts } from '../agentInputParts';

describe('toAgentInputParts', () => {
  test('projects ready attachments by managed id without their preview URI', () => {
    const fileEntryId = FileEntryIdSchema.parse('00000000-0000-7000-8000-000000000001');
    const payload: ComposerSendPayload = {
      attachments: [
        {
          fileEntryId,
          id: 'file:ready',
          kind: 'image',
          mediaType: 'image/png',
          name: 'image.png',
          size: 128,
          status: 'ready',
          uri: 'file:///private/managed/image.png',
        },
      ],
      text: 'Describe this.',
    };

    const parts = toAgentInputParts(payload);

    expect(parts).toEqual([
      { type: 'text', text: 'Describe this.' },
      {
        type: 'file',
        fileEntryId,
        mediaType: 'image/png',
        name: 'image.png',
      },
    ]);
    expect(JSON.stringify(parts)).not.toContain('file:///');
  });
});
