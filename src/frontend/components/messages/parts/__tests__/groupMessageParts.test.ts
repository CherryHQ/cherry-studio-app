import type { CherryMessagePart } from '@/shared/data/types/message';

import { groupMessageParts } from '../groupMessageParts';

function file(id: string): CherryMessagePart {
  return {
    filename: `${id}.md`,
    mediaType: 'text/markdown',
    providerMetadata: { cherry: { fileEntryId: id } },
    type: 'file',
    url: `cherry://file/${id}`,
  };
}

function text(value: string): CherryMessagePart {
  return { text: value, type: 'text' };
}

describe('groupMessageParts', () => {
  test('collapses adjacent files without moving them past other parts', () => {
    const groups = groupMessageParts([
      text('before'),
      file('a'),
      file('b'),
      text('after'),
      file('c'),
    ]);

    expect(
      groups.map((group) =>
        group.kind === 'files'
          ? group.parts.map((part) => part.filename)
          : (group.part as { text: string }).text,
      ),
    ).toEqual(['before', ['a.md', 'b.md'], 'after', ['c.md']]);
  });

  test('groups on part type alone, so a peer transcript with no Cherry metadata lays out the same', () => {
    const bare: CherryMessagePart = {
      filename: 'a.md',
      mediaType: 'text/markdown',
      type: 'file',
      url: 'https://peer.example/a.md',
    };
    const groups = groupMessageParts([text('x'), bare, bare]);

    expect(groups.map((group) => group.kind)).toEqual(['part', 'files']);
    expect(groups[1]?.kind === 'files' && groups[1].parts).toHaveLength(2);
  });

  test('drops source parts and keeps the run they interrupt intact', () => {
    const source: CherryMessagePart = {
      sourceId: 'source-1',
      type: 'source-url',
      url: 'https://cherry-ai.com',
    };
    const groups = groupMessageParts([file('a'), source, file('b')]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.kind === 'files' && groups[0].parts).toHaveLength(2);
  });

  test('carries the original part index so citations still resolve', () => {
    const groups = groupMessageParts([file('a'), text('cited')]);

    expect(groups.map((group) => group.index)).toEqual([0, 1]);
  });
});
