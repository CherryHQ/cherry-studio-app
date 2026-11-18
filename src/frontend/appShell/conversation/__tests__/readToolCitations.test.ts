import { readToolCitations } from '../readToolCitations';

describe('readToolCitations', () => {
  it('reads built-in lookup sources forwarded through tool_invoke without MCP metadata', async () => {
    const tool = {
      key: 'call-1',
      title: 'tool_invoke',
      state: 'completed' as const,
      input: {
        kind: 'inline' as const,
        value: {
          kind: 'json' as const,
          complete: true as const,
          value: { name: 'web_search', arguments: { query: 'cherry' } },
        },
      },
      output: {
        kind: 'inline' as const,
        value: {
          kind: 'text' as const,
          complete: true as const,
          text: JSON.stringify([
            { id: 'lookup-1', title: 'Result', url: 'https://example.com/result' },
          ]),
        },
      },
    };

    await expect(readToolCitations(tool, new AbortController().signal)).resolves.toEqual([
      { content: undefined, id: 'lookup-1', title: 'Result', url: 'https://example.com/result' },
    ]);
  });

  it('rejects wrapped non-Cherry tools before reading output', async () => {
    const readOutput = jest.fn();
    const tool = {
      key: 'call-2',
      title: 'tool_invoke',
      state: 'completed' as const,
      input: {
        kind: 'inline' as const,
        value: {
          kind: 'json' as const,
          complete: true as const,
          value: { name: 'mcp__other__web_search' },
        },
      },
      output: { kind: 'deferred' as const, key: 'out', read: readOutput },
    };

    await expect(readToolCitations(tool, new AbortController().signal)).resolves.toEqual([]);
    expect(readOutput).not.toHaveBeenCalled();
  });

  it('requires Cherry metadata for unwrapped built-in tool names', async () => {
    const bare = {
      key: 'call-3',
      title: 'web_search',
      state: 'completed' as const,
      output: {
        kind: 'inline' as const,
        value: {
          kind: 'json' as const,
          complete: true as const,
          value: [{ id: 'lookup-1', title: 'Unverified', url: 'https://example.com/bare' }],
        },
      },
    };
    const builtin = {
      ...bare,
      key: 'call-4',
      output: {
        kind: 'inline' as const,
        value: {
          kind: 'json' as const,
          complete: true as const,
          value: {
            metadata: { type: 'builtin' },
            content: [{ id: 'lookup-2', title: 'Verified', url: 'https://example.com/builtin' }],
          },
        },
      },
    };

    await expect(readToolCitations(bare, new AbortController().signal)).resolves.toEqual([]);
    await expect(readToolCitations(builtin, new AbortController().signal)).resolves.toEqual([
      { content: undefined, id: 'lookup-2', title: 'Verified', url: 'https://example.com/builtin' },
    ]);
  });
});
