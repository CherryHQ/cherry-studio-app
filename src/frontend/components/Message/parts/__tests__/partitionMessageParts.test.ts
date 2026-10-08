import type { CherryMessagePart } from '@/shared/data/types/message';

import { groupMessageProcessItems, partitionMessageParts } from '../partitionMessageParts';

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

describe('groupMessageProcessItems', () => {
  test('folds narration, reasoning, and tool calls together while preserving their order', () => {
    const parts = [
      text('First phase'),
      reasoning('plan'),
      tool('read-1'),
      reasoning('next'),
      tool('read-2'),
      text('Second phase'),
      tool('write'),
      reasoning('finish'),
    ];
    const items = parts.map((part, index) => ({ part, index, key: `source-${index}` }));
    const groups = groupMessageProcessItems(items);

    expect(groups.map((group) => group.kind)).toEqual(['tools']);
    const runs = groups.filter((group) => group.kind === 'tools');
    expect(runs.map((group) => group.tools.length)).toEqual([3]);
    expect(runs.map((group) => group.items.map((item) => item.key))).toEqual([
      [
        'source-0',
        'source-1',
        'source-2',
        'source-3',
        'source-4',
        'source-5',
        'source-6',
        'source-7',
      ],
    ]);
    expect(groups.flatMap((group) => (group.kind === 'part' ? [group.item] : group.items))).toEqual(
      items,
    );
  });

  test('leaves tool-free reasoning unchanged and keeps a growing run anchored to its first part', () => {
    const first = { part: reasoning('plan'), index: 0, key: 'reasoning-id' };
    expect(groupMessageProcessItems([first])).toEqual([{ kind: 'part', item: first }]);
    const run = [first, { part: tool('read'), index: 1, key: 'read-id' }];
    const groups = groupMessageProcessItems([
      ...run,
      { part: tool('write'), index: 2, key: 'write-id' },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind === 'tools' && groups[0].items[0]).toBe(first);
  });

  test('keeps in-loop compaction inside a tool run but leaves unrelated process parts separate', () => {
    const parts: CherryMessagePart[] = [
      tool('read'),
      {
        type: 'data-compaction-anchor',
        data: { phase: 'in-loop', status: 'done' },
      },
      text('Continuing'),
      tool('write'),
      { type: 'data-compact', data: { content: 'Summary', compactedContent: 'Earlier text' } },
    ];
    const groups = groupMessageProcessItems(
      parts.map((part, index) => ({ part, index, key: `part-${index}` })),
    );
    expect(groups.map((group) => group.kind)).toEqual(['tools', 'part']);
    expect(groups[0].kind === 'tools' && groups[0].items.map((item) => item.key)).toEqual([
      'part-0',
      'part-1',
      'part-2',
      'part-3',
    ]);
  });
});

describe('partitionMessageParts', () => {
  test('keeps turn-start markers visible and in-loop markers between their tools', () => {
    const boundary = {
      type: 'data-compaction-anchor',
      data: { phase: 'turn-start', status: 'done' },
    } as const;
    const inLoop = {
      type: 'data-compaction-anchor',
      data: { phase: 'in-loop', status: 'done' },
    } as const;
    const result = partitionMessageParts([boundary, tool('a'), inLoop, tool('b'), text('answer')]);
    expect(result.boundaries.map(({ index }) => index)).toEqual([0]);
    expect(result.process.map(({ index }) => index)).toEqual([1, 2, 3]);
    expect(result.body.map(({ index }) => index)).toEqual([4]);
  });

  test('skipped compaction leaves no process group or blank boundary and cannot hide the answer', () => {
    const skipped = {
      type: 'data-compaction-anchor',
      data: { phase: 'turn-start', status: 'skipped' },
    } as const;
    const result = partitionMessageParts([text('answer'), skipped]);
    expect(result.boundaries).toEqual([]);
    expect(result.process).toEqual([]);
    expect(result.body.map(({ index }) => index)).toEqual([0]);
  });

  test('collects non-image files after the body, in the order they were produced', () => {
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

  test('keeps tool images before their explanation and later images after it', () => {
    const image = { ...file('image'), mediaType: 'image/png' };
    const laterImage = { ...file('later'), mediaType: 'image/webp' };
    const parts = [tool('generate_image'), image, text('explanation'), laterImage, file('notes')];
    const { body, files, process } = partitionMessageParts(parts);

    expect(body.map(({ index }) => index)).toEqual([1, 2, 3]);
    expect(body.map(({ part }) => part)).toEqual([image, parts[2], laterImage]);
    expect(process.map(({ index }) => index)).toEqual([0]);
    expect(files).toEqual([parts[4]]);
  });

  test('keeps an image visible even when no final text follows the tool result', () => {
    const image: CherryMessagePart = {
      mediaType: 'image/png',
      type: 'file',
      url: 'https://peer.example/image.png',
    };
    const { body, files } = partitionMessageParts([tool('generate_image'), image]);

    expect(body).toEqual([{ index: 1, kind: 'part', part: image }]);
    expect(files).toEqual([]);
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

  test('ignores settled blank text between steps and after the answer without changing indices', () => {
    const { body, process } = partitionMessageParts([
      reasoning('thinking'),
      text(''),
      tool('read'),
      text('\n  \t'),
      reasoning('checking'),
      text('answer'),
      text('  '),
    ]);

    expect(process.map(({ index }) => index)).toEqual([0, 2, 4]);
    expect(body.map(({ index }) => index)).toEqual([5]);
  });

  test('keeps an empty streaming text part mounted while its first content arrives', () => {
    const part: CherryMessagePart = { state: 'streaming', text: '', type: 'text' };
    expect(partitionMessageParts([part]).process).toEqual([{ index: 0, part }]);
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

  test('keeps a terminal error inline while folding preceding process parts', () => {
    const failure = error();
    const partitioned = partitionMessageParts([
      reasoning('thinking'),
      tool('a'),
      text('partial answer'),
      failure,
    ]);

    expect(partitioned.process.map(({ index }) => index)).toEqual([0, 1]);
    expect(partitioned.body.map(({ index, part }) => [index, part.type])).toEqual([
      [2, 'text'],
      [3, 'data-error'],
    ]);
  });

  test('keeps an error-only assistant outcome out of the collapsed process group', () => {
    const failure = error();
    const partitioned = partitionMessageParts([failure]);

    expect(partitioned.process).toEqual([]);
    expect(partitioned.body).toEqual([{ index: 0, kind: 'part', part: failure }]);
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

function error(): CherryMessagePart {
  return {
    type: 'data-error',
    data: {
      code: 'EXECUTION_FAILED',
      message: 'provider diagnostic',
      reasonCode: 'auth',
      retryable: false,
      source: { layer: 'provider', code: 'invalid_api_key' },
    },
  } as CherryMessagePart;
}
