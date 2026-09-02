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
    const { body, files, process } = partitionMessageParts([
      text('before'),
      file('a'),
      text('after'),
      file('b'),
    ]);

    expect(
      body.map((item) => (item.kind === 'part' ? (item.part as { text: string }).text : item.kind)),
    ).toEqual(['after']);
    expect(process.map((item) => (item.part as { text: string }).text)).toEqual(['before']);
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

  test('folds intermediate prose and tools while keeping only the final result text', () => {
    const { body, process } = partitionMessageParts([
      text('intro'),
      tool('a'),
      tool('b'),
      text('answer'),
    ]);

    expect(process.map(({ index }) => index)).toEqual([0, 1, 2]);
    expect(body.map(({ index }) => index)).toEqual([3]);
  });

  test('collects reasoning and tools before the answer as one process prefix', () => {
    const { body, process } = partitionMessageParts([
      reasoning('thinking'),
      tool('a'),
      text('answer'),
    ]);

    expect(process.map(({ index }) => index)).toEqual([0, 1]);
    expect(body.map((item) => item.kind)).toEqual(['part']);
  });

  test('folds every visible part before the final result despite interleaved sources and files', () => {
    const source: CherryMessagePart = {
      sourceId: 'source-1',
      type: 'source-url',
      url: 'https://cherry-ai.com',
    };
    const partitioned = partitionMessageParts([
      tool('a'),
      source,
      file('artifact'),
      tool('b'),
      text('answer'),
      tool('c'),
      tool('d'),
      text('final answer'),
    ]);

    expect(partitioned.process.map(({ index }) => index)).toEqual([0, 3, 4, 5, 6]);
    expect(partitioned.body.map(({ index }) => index)).toEqual([7]);
  });

  test('does not expose an earlier text part when a tool is still the last visible content', () => {
    const partitioned = partitionMessageParts([text('intermediate'), tool('a')]);

    expect(partitioned.process.map(({ index }) => index)).toEqual([0, 1]);
    expect(partitioned.body).toHaveLength(0);
  });

  test('provider web searches stay invisible and do not create an empty process group', () => {
    const provider = providerWebSearch();
    const grouped = partitionMessageParts([tool('a'), provider, tool('b')]);
    expect(grouped.process).toHaveLength(2);
    expect(grouped.body).toHaveLength(0);

    const single = partitionMessageParts([provider, tool('a')]);
    expect(single.process).toHaveLength(1);
    expect(single.body).toHaveLength(0);
  });
});

function reasoning(value: string): CherryMessagePart {
  return { state: 'done', text: value, type: 'reasoning' } as CherryMessagePart;
}

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
