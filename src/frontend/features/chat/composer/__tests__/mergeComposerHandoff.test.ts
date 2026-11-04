import type { ComposerAttachmentReady } from '@/frontend/components/Composer/utils/composerAttachments';

import { mergeComposerHandoff } from '../mergeComposerHandoff';

function attachment(fileEntryId: string, id = fileEntryId): ComposerAttachmentReady {
  return {
    fileEntryId,
    id,
    kind: 'file',
    mediaType: 'text/plain',
    name: id,
    status: 'ready',
    uri: id,
  };
}

describe('mergeComposerHandoff', () => {
  const first = attachment('first');
  const second = attachment('second');
  const third = attachment('third');

  it('seeds an empty draft', () => {
    expect(
      mergeComposerHandoff(
        { draft: '', attachments: [] },
        { draft: 'shared', attachments: [first] },
      ),
    ).toEqual({ draft: 'shared', attachments: [first] });
  });

  it('appends text with one newline and preserves existing text when incoming text is empty', () => {
    expect(
      mergeComposerHandoff(
        { draft: 'existing', attachments: [] },
        { draft: 'shared', attachments: [] },
      ).draft,
    ).toBe('existing\nshared');
    expect(
      mergeComposerHandoff({ draft: 'existing', attachments: [] }, { draft: '', attachments: [] })
        .draft,
    ).toBe('existing');
  });

  it('preserves order and deduplicates file entry IDs, including within the incoming share', () => {
    expect(
      mergeComposerHandoff(
        { draft: '', attachments: [first] },
        {
          draft: '',
          attachments: [
            second,
            attachment('first', 'other-id'),
            third,
            attachment('second', 'duplicate'),
          ],
        },
      ).attachments,
    ).toEqual([first, second, third]);
  });
});
