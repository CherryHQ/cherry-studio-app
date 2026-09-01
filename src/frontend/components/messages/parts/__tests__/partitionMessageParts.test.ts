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

    expect(
      body.map((item) => (item.kind === 'part' ? (item.part as { text: string }).text : item.kind)),
    ).toEqual(['before', 'after']);
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

  test('folds a run of consecutive tool calls into one group with original indices', () => {
    const { body } = partitionMessageParts([text('intro'), tool('a'), tool('b'), text('answer')]);

    expect(body.map((item) => item.kind)).toEqual(['part', 'tool-group', 'part']);
    const group = body[1];
    if (group.kind !== 'tool-group') {
      throw new Error('expected a tool group');
    }
    expect(group.index).toBe(1);
    expect(group.items.map(({ index }) => index)).toEqual([1, 2]);
  });

  test('keeps a lone tool call as its own row', () => {
    const { body } = partitionMessageParts([tool('a'), text('answer')]);

    expect(body.map((item) => item.kind)).toEqual(['part', 'part']);
  });

  test('splits runs on prose but not on lifted source and file parts', () => {
    const source: CherryMessagePart = {
      sourceId: 'source-1',
      type: 'source-url',
      url: 'https://cherry-ai.com',
    };
    const { body } = partitionMessageParts([
      tool('a'),
      source,
      file('artifact'),
      tool('b'),
      text('answer'),
      tool('c'),
      tool('d'),
    ]);

    expect(body.map((item) => item.kind)).toEqual(['tool-group', 'part', 'tool-group']);
  });

  test('provider web searches neither count toward a group nor render inside one', () => {
    const provider = providerWebSearch();
    const grouped = partitionMessageParts([tool('a'), provider, tool('b')]);
    expect(grouped.body.map((item) => item.kind)).toEqual(['tool-group']);
    const group = grouped.body[0];
    if (group.kind !== 'tool-group') {
      throw new Error('expected a tool group');
    }
    expect(group.items).toHaveLength(2);

    // One visible call beside a provider search is still a lone call, and the
    // provider part passes through for its renderer to suppress.
    const single = partitionMessageParts([provider, tool('a')]);
    expect(single.body.map((item) => item.kind)).toEqual(['part', 'part']);
  });
});

function tool(id: string): CherryMessagePart {
  return {
    input: {},
    output: {},
    state: 'output-available',
    toolCallId: `call-${id}`,
    toolName: id,
    type: 'dynamic-tool',
  } as unknown as CherryMessagePart;
}

function providerWebSearch(): CherryMessagePart {
  return {
    input: {},
    output: {},
    state: 'output-available',
    toolCallId: 'call-provider-search',
    toolMetadata: { cherry: { tool: { type: 'provider' } } },
    toolName: 'web_search',
    type: 'dynamic-tool',
  } as unknown as CherryMessagePart;
}
