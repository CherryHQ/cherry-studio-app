import type { CherryMessagePart } from '@/shared/data/types/message';

import { partitionMessageParts } from '../partitionMessageParts';

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

describe('partitionMessageParts', () => {
  test('lifts every file out of the body, in the order it was produced', () => {
    const { body, files } = partitionMessageParts([
      text('before'),
      file('a'),
      text('after'),
      file('b'),
    ]);

    expect(body.map(({ part }) => (part as { text: string }).text)).toEqual(['before', 'after']);
    expect(files.map((part) => part.filename)).toEqual(['a.md', 'b.md']);
  });

  test('splits on part type alone, so a peer transcript with no Cherry metadata splits the same', () => {
    const bare: CherryMessagePart = {
      filename: 'a.md',
      mediaType: 'text/markdown',
      type: 'file',
      url: 'https://peer.example/a.md',
    };

    expect(partitionMessageParts([text('x'), bare]).files).toEqual([bare]);
  });

  test('drops source parts, which SourceGroup collects separately', () => {
    const source: CherryMessagePart = {
      sourceId: 'source-1',
      type: 'source-url',
      url: 'https://cherry-ai.com',
    };

    expect(partitionMessageParts([text('x'), source]).body).toHaveLength(1);
  });

  test('carries the original part index so citations still resolve', () => {
    const { body } = partitionMessageParts([file('a'), text('cited')]);

    expect(body.map(({ index }) => index)).toEqual([1]);
  });
});
