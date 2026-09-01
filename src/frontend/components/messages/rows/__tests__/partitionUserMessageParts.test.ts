import type { CherryMessagePart } from '@/shared/data/types/message';

import type { MessageListItem } from '../../types';
import { partitionUserMessageParts } from '../partitionUserMessageParts';

describe('partitionUserMessageParts', () => {
  test('keeps a text-only message intact', () => {
    const message = createMessage([textPart('Hello')]);

    const partition = partitionUserMessageParts(message);

    expect(partition.attachments).toEqual([]);
    expect(partition.bodyMessage).toBe(message);
  });

  test('extracts managed attachments in source order without mutating the message', () => {
    const parts = [
      textPart('Hello'),
      managedFilePart('first.png', '00000000-0000-7000-8000-000000000001'),
      textPart('World'),
      managedFilePart('second.pdf', '00000000-0000-7000-8000-000000000002'),
    ];
    const message = {
      ...createMessage(parts),
      data: { partKeys: ['text-1', 'file-1', 'text-2', 'file-2'], parts },
    };

    const partition = partitionUserMessageParts(message);

    expect(partition.attachments.map(({ index, part }) => [index, part.filename])).toEqual([
      [1, 'first.png'],
      [3, 'second.pdf'],
    ]);
    expect(partition.bodyMessage?.data.parts).toEqual([parts[0], parts[2]]);
    expect(partition.bodyMessage?.data.partKeys).toEqual(['text-1', 'text-2']);
    expect(message.data.parts).toBe(parts);
  });

  test('omits unmanaged files and does not create an empty body message', () => {
    const managed = managedFilePart('photo.png', '00000000-0000-7000-8000-000000000003');
    const message = createMessage([unmanagedFilePart('legacy.pdf'), managed]);

    const partition = partitionUserMessageParts(message);

    expect(partition.attachments).toEqual([{ index: 1, part: managed }]);
    expect(partition.bodyMessage).toBeUndefined();
  });
});

function createMessage(parts: CherryMessagePart[]): MessageListItem {
  return {
    data: { parts },
    id: '00000000-0000-7000-8000-000000000010',
    role: 'user',
    status: 'success',
  };
}

function textPart(text: string): CherryMessagePart {
  return { text, type: 'text' };
}

function managedFilePart(filename: string, fileEntryId: string): CherryMessagePart {
  return {
    ...unmanagedFilePart(filename),
    providerMetadata: { cherry: { fileEntryId } },
  };
}

function unmanagedFilePart(filename: string): Extract<CherryMessagePart, { type: 'file' }> {
  return {
    filename,
    mediaType: filename.endsWith('.png') ? 'image/png' : 'application/pdf',
    type: 'file',
    url: `file:///${filename}`,
  };
}
