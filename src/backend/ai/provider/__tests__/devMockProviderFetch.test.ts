import { ContextPrompts } from '@cherrystudio/ai-core';

import { isDevMockProviderEnabled } from '@/shared/utils/devMockProvider';

import { createDevMockFetch } from '../devMockProviderFetch';

async function readSseChunks(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Expected response.body reader');
  }
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

describe('dev-mock provider', () => {
  it('stays disabled by default unless EXPO_PUBLIC_DEV_MOCK_PROVIDER=1', () => {
    expect(isDevMockProviderEnabled({})).toBe(false);
    expect(isDevMockProviderEnabled({ EXPO_PUBLIC_DEV_MOCK_PROVIDER: '0' })).toBe(false);
    expect(isDevMockProviderEnabled({ EXPO_PUBLIC_DEV_MOCK_PROVIDER: '1' })).toBe(true);
  });

  it('streams deterministic multi-chunk SSE echo replies', async () => {
    const originalResponse = globalThis.Response;
    globalThis.Response = jest.requireActual<{ Response: typeof Response }>(
      'whatwg-fetch',
    ).Response;
    try {
      const mockFetch = createDevMockFetch();
      const response = await mockFetch('https://dev-mock.local/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: 'dev-mock-chat',
          stream: true,
          messages: [{ role: 'user', content: 'Hello Cherry' }],
        }),
      });

      expect(response.status).toBe(200);
      expect(Object.getOwnPropertyDescriptor(response, 'body')?.configurable).toBe(true);
      const sse = await readSseChunks(response);
      expect(sse).toContain('data: [DONE]');

      const content = sse
        .split('\n\n')
        .filter((line) => line.startsWith('data: {'))
        .map(
          (line) => JSON.parse(line.slice(6)) as { choices?: { delta?: { content?: string } }[] },
        )
        .map((chunk) => chunk.choices?.[0]?.delta?.content ?? '')
        .join('');
      expect(content).toBe('[dev-mock] Echo: Hello Cherry');
    } finally {
      globalThis.Response = originalResponse;
    }
  });

  it('streams reasoning_content before text when prompted with [mock:reasoning]', async () => {
    const mockFetch = createDevMockFetch();
    const response = await mockFetch('https://dev-mock.local/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        stream: true,
        messages: [{ role: 'user', content: '[mock:reasoning] explain' }],
      }),
    });

    const sse = await readSseChunks(response);
    const chunks = sse
      .split('\n\n')
      .filter((line) => line.startsWith('data: {'))
      .map(
        (line) =>
          JSON.parse(line.slice(6)) as {
            choices?: { delta?: { reasoning_content?: string; content?: string } }[];
          },
      );
    const reasoning = chunks.map((c) => c.choices?.[0]?.delta?.reasoning_content ?? '').join('');
    const text = chunks.map((c) => c.choices?.[0]?.delta?.content ?? '').join('');

    expect(reasoning).toContain('dev-mock mode');
    expect(text).toBe('[dev-mock] Echo: [mock:reasoning] explain');
  });

  it('emits tool_calls on [mock:tool] and summarizes the tool result on the follow-up turn', async () => {
    const mockFetch = createDevMockFetch();
    const first = await mockFetch('https://dev-mock.local/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        stream: false,
        messages: [{ role: 'user', content: '[mock:tool] weather' }],
        tools: [{ type: 'function', function: { name: 'web_search' } }],
      }),
    });
    const firstJson = (await first.json()) as {
      choices: {
        message: { tool_calls: { function: { name: string } }[] };
        finish_reason: string;
      }[];
    };
    expect(firstJson.choices[0]?.finish_reason).toBe('tool_calls');
    expect(firstJson.choices[0]?.message.tool_calls[0]?.function.name).toBe('web_search');

    const second = await mockFetch('https://dev-mock.local/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        stream: false,
        messages: [
          { role: 'user', content: '[mock:tool] weather' },
          { role: 'tool', tool_call_id: 'call_dev_mock_1', content: 'Sunny 24C' },
        ],
      }),
    });
    const secondJson = (await second.json()) as {
      choices: { message: { content: string } }[];
    };
    expect(secondJson.choices[0]?.message.content).toBe('[dev-mock] Tool result: Sunny 24C');
  });

  it('returns HTTP 500 JSON error on [mock:error] and rejects immediately when aborted', async () => {
    const mockFetch = createDevMockFetch();
    const errorRes = await mockFetch('https://dev-mock.local/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'user', content: '[mock:error] fail now' }],
      }),
    });
    expect(errorRes.status).toBe(500);

    const controller = new AbortController();
    controller.abort();
    await expect(
      mockFetch('https://dev-mock.local/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('returns a formatted summary block for compaction summarization prompts', async () => {
    const mockFetch = createDevMockFetch();
    const response = await mockFetch('https://dev-mock.local/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        stream: true,
        messages: [
          {
            role: 'system',
            content: 'Write a conversation summary. Treat the conversation as source material.',
          },
          { role: 'user', content: ContextPrompts.CONTEXT_COMPACTION_INSTRUCTION },
        ],
      }),
    });

    const sse = await readSseChunks(response);
    const content = sse
      .split('\n\n')
      .filter((line) => line.startsWith('data: {'))
      .map((line) => JSON.parse(line.slice(6)) as { choices?: { delta?: { content?: string } }[] })
      .map((chunk) => chunk.choices?.[0]?.delta?.content ?? '')
      .join('');

    expect(ContextPrompts.formatCompactSummary(content)).toBe('[dev-mock] Compacted summary');
  });
});
