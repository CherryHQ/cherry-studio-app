import type { ComposerSendPayload } from '@/frontend/components/Composer';
import { FileEntryIdSchema } from '@/shared/data/types/file';

import { toAgentInputParts } from '../agentInputParts';

describe('toAgentInputParts', () => {
  test('carries the display snapshot alongside the plain prompt', () => {
    const pluginReferences = [
      { type: 'plugin' as const, pluginId: 'feishu', label: '飞书', offset: 0 },
    ];
    expect(toAgentInputParts({ text: '飞书 查找文档', attachments: [] }, pluginReferences)).toEqual(
      [{ type: 'text', text: '飞书 查找文档', pluginReferences }],
    );
  });
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
