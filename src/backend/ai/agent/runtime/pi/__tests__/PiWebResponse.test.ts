import type { Api, AssistantMessage, Model } from '@earendil-works/pi-ai';

import { applyPiWebReplay, PiWebResponse, readPiWebResult } from '../PiWebResponse';

function message(text: string): AssistantMessage {
  return {
    api: 'openai-responses',
    model: 'test',
    provider: 'test',
    role: 'assistant',
    timestamp: 1,
    stopReason: 'stop',
    content: [{ type: 'text', text, textSignature: 'signed' }],
    usage: {
      input: 10,
      output: 10,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 20,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}

test('projects OpenAI annotations once while preserving signed replay text', () => {
  const capture = new PiWebResponse('native-turn-1', 'openai-responses');
  const text = 'Answer [1]';
  const item = {
    type: 'message',
    id: 'msg-1',
    content: [
      {
        type: 'output_text',
        text,
        annotations: [
          {
            type: 'url_citation',
            url: 'https://example.com/a',
            title: 'A',
            start_index: 7,
            end_index: 10,
          },
        ],
      },
    ],
  };
  capture.observe({ type: 'response.output_item.done', item });
  capture.observe({ type: 'response.completed', response: { output: [item] } });
  const original = message(text);
  const settled = capture.settle(original);
  expect(original.content).toHaveLength(1);
  expect(settled.content[0]).toEqual({ type: 'text', text, textSignature: 'signed' });
  expect(settled.content[1]).toMatchObject({
    type: 'text',
    text: expect.stringContaining('https://example.com/a'),
  });
  expect(readPiWebResult(settled)).toEqual({
    version: 1,
    id: 'native-turn-1',
    sources: [{ sourceId: 'native-turn-1-1', url: 'https://example.com/a', title: 'A' }],
    texts: [{ contentIndex: 0, text: 'Answer [cite:native-turn-1-1]' }],
    replayIndex: 1,
    failed: false,
  });
});

test('places Gemini citations after UTF-8 segments and retains search presentation', () => {
  const capture = new PiWebResponse('native-turn-2', 'google');
  const chunk = {
    candidates: [
      {
        groundingMetadata: {
          groundingChunks: [{ web: { uri: 'https://example.com/a', title: 'A' } }],
          groundingSupports: [
            {
              segment: { startIndex: 0, endIndex: 10, text: '中文🍒' },
              groundingChunkIndices: [0],
            },
          ],
          searchEntryPoint: { renderedContent: '<div>Search suggestions</div>' },
        },
      },
    ],
  };
  capture.observe(chunk);
  capture.observe(chunk);
  expect(readPiWebResult(capture.settle(message('中文🍒 answer')))).toMatchObject({
    sources: [{ sourceId: 'native-turn-2-1', url: 'https://example.com/a', title: 'A' }],
    suggestions: '<div>Search suggestions</div>',
    texts: [{ contentIndex: 0, text: '中文🍒[cite:native-turn-2-1] answer' }],
  });
});

test('keeps successful URL context sources after a partial failure', () => {
  const capture = new PiWebResponse('native-turn-3', 'google');
  capture.observe({
    candidates: [
      {
        urlContextMetadata: {
          urlMetadata: [
            {
              retrievedUrl: 'https://example.com/a',
              urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS',
            },
            {
              retrievedUrl: 'https://example.com/b',
              urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_ERROR',
            },
          ],
        },
      },
    ],
  });
  const settled = capture.settle(message('Partial answer'));
  expect(readPiWebResult(settled)).toMatchObject({
    failed: true,
    sources: [{ url: 'https://example.com/a' }],
  });
  expect(settled.content.at(-1)).toMatchObject({
    text: expect.stringContaining('Web tools are unavailable'),
  });
});

test('drops unsafe URLs and stale metadata from a failed credential attempt', () => {
  const capture = new PiWebResponse('native-turn-4', 'google');
  capture.observe({
    candidates: [
      {
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: 'javascript:alert(1)' } },
            { web: { uri: 'https://user:secret@example.com' } },
            { web: { uri: 'https://example.com/a' } },
          ],
          searchEntryPoint: { renderedContent: '<div>Suggestions</div>' },
        },
      },
    ],
  });
  expect(readPiWebResult(capture.settle(message('Lookup')))?.sources).toEqual([
    { sourceId: 'native-turn-4-1', url: 'https://example.com/a' },
  ]);
  capture.observe({
    candidates: [
      {
        urlContextMetadata: { urlMetadata: [{ urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_ERROR' }] },
      },
    ],
  });
  capture.reset();
  const unchanged = message('No lookup');
  expect(capture.settle(unchanged)).toBe(unchanged);
});

test('retains Google search suggestions even when no source URLs are returned', () => {
  const capture = new PiWebResponse('native-turn-5', 'google');
  capture.observe({
    candidates: [
      { groundingMetadata: { searchEntryPoint: { renderedContent: '<div>Suggestions</div>' } } },
    ],
  });
  const settled = capture.settle(message('Answer'));
  expect(settled.content).toHaveLength(1);
  expect(readPiWebResult(settled)).toEqual({
    version: 1,
    id: 'native-turn-5',
    sources: [],
    suggestions: '<div>Suggestions</div>',
    texts: [],
    failed: false,
  });
});

test('returns OpenAI search calls to the reasoning items they followed', () => {
  const capture = new PiWebResponse('native-turn-6', 'xai');
  const search = (id: string) => ({
    type: id === 'ws_2' ? 'x_search_call' : 'web_search_call',
    id,
    status: 'completed',
    action: { type: 'search', query: id },
  });
  [
    { type: 'reasoning', id: 'rs_1' },
    search('ws_1'),
    search('ws_2'),
    { type: 'reasoning', id: 'rs_2' },
    { type: 'message', id: 'msg_1', content: [{ type: 'output_text', text: 'Answer' }] },
    // No reasoning item requires this call, so it is not replayed.
    search('ws_3'),
  ].forEach((item, output_index) =>
    capture.observe({ type: 'response.output_item.done', output_index, item }),
  );
  const settled = capture.settle(message('Answer'));
  expect(readPiWebResult(settled)?.openaiItems).toEqual([
    { after: 'rs_1', item: search('ws_1') },
    { after: 'ws_1', item: search('ws_2') },
  ]);

  const input = [
    { role: 'user', content: 'Question' },
    { type: 'reasoning', id: 'rs_1' },
    { type: 'reasoning', id: 'rs_2' },
    { type: 'message', id: 'msg_1' },
  ];
  const model = { api: 'openai-responses', provider: 'test', id: 'test' } as Model<Api>;
  expect(applyPiWebReplay({ input }, model, [settled])).toEqual({
    input: [input[0], input[1], search('ws_1'), search('ws_2'), input[2], input[3]],
  });
  // Another model replays no reasoning item, so its search calls stay out as well.
  const foreign = { input: [input[0], input[3]] };
  expect(applyPiWebReplay(foreign, model, [settled])).toEqual(foreign);
  expect(applyPiWebReplay({ input }, { ...model, api: 'openai-completions' }, [settled])).toEqual({
    input,
  });
});

test('ignores a stored result that no longer matches its schema', () => {
  const stored = message('Answer');
  stored.diagnostics = [{ type: 'cherry.web', timestamp: 1, details: { version: 2 } }];
  expect(readPiWebResult(stored)).toBeUndefined();
});

test('appends Anthropic citations to their own text block and keeps max-uses a limit', () => {
  const capture = new PiWebResponse('native-turn-7', 'anthropic');
  const start = (index: number, content_block: Record<string, unknown>) =>
    capture.observe({ type: 'content_block_start', index, content_block });
  start(0, { type: 'text', text: '' });
  start(1, { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search' });
  start(2, {
    type: 'web_search_tool_result',
    tool_use_id: 'srvtoolu_1',
    content: [
      {
        type: 'web_search_result',
        url: 'https://example.com/a',
        title: 'A',
        encrypted_content: 'x',
      },
    ],
  });
  start(3, { type: 'text', text: '' });
  capture.observe({
    type: 'content_block_delta',
    index: 3,
    delta: {
      type: 'citations_delta',
      citation: { type: 'web_search_result_location', url: 'https://example.com/a', title: 'A' },
    },
  });
  start(4, {
    type: 'web_search_tool_result',
    tool_use_id: 'srvtoolu_2',
    content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' },
  });
  const answer = message('Let me check. ');
  answer.content.push({ type: 'text', text: 'Shannon was born in 1916' });
  expect(readPiWebResult(capture.settle(answer))).toMatchObject({
    failed: false,
    sources: [{ sourceId: 'native-turn-7-1', url: 'https://example.com/a' }],
    // Stream index 3 is Pi's second block: the server tool blocks between are not content.
    texts: [{ contentIndex: 1, text: 'Shannon was born in 1916[cite:native-turn-7-1]' }],
  });

  start(5, {
    type: 'web_fetch_tool_result',
    content: { type: 'web_fetch_tool_result_error', error_code: 'unavailable' },
  });
  expect(readPiWebResult(capture.settle(answer))?.failed).toBe(true);
});

test('keeps source facts ahead of a pending tool call', () => {
  const capture = new PiWebResponse('native-turn-8', 'anthropic');
  capture.observe({
    type: 'content_block_start',
    index: 0,
    content_block: {
      type: 'web_search_tool_result',
      content: [{ type: 'web_search_result', url: 'https://example.com/a', title: 'A' }],
    },
  });
  const calling = message('Reading the file next.');
  calling.content.push({ type: 'toolCall', id: 'call-1', name: 'read_file', arguments: {} });
  const settled = capture.settle(calling);
  expect(settled.content.map((block) => block.type)).toEqual(['text', 'text', 'toolCall']);
  expect(readPiWebResult(settled)?.replayIndex).toBe(1);
});

test.each(['char_location', 'page_location'])(
  'links Anthropic fetched-document %s citations to their source',
  (type) => {
    const capture = new PiWebResponse('fetch', 'anthropic');
    for (const [index, url] of ['javascript:invalid', 'https://example.com/page'].entries())
      capture.observe({
        type: 'content_block_start',
        index,
        content_block: {
          type: 'web_fetch_tool_result',
          content: {
            type: 'web_fetch_result',
            url,
            content: { type: 'document', title: 'Page' },
          },
        },
      });
    capture.observe({
      type: 'content_block_start',
      index: 2,
      content_block: { type: 'text', text: '' },
    });
    for (const document_index of [0, 1, 99])
      capture.observe({
        type: 'content_block_delta',
        index: 2,
        delta: { type: 'citations_delta', citation: { type, document_index } },
      });
    const result = readPiWebResult(capture.settle(message('Answer')));
    expect(result?.sources).toEqual([
      { sourceId: 'fetch-1', url: 'https://example.com/page', title: 'Page' },
    ]);
    expect(result?.texts).toEqual([{ contentIndex: 0, text: 'Answer[cite:fetch-1]' }]);

    capture.reset();
    capture.observe({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    });
    capture.observe({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'citations_delta', citation: { type, document_index: 1 } },
    });
    expect(readPiWebResult(capture.settle(message('New answer')))).toBeUndefined();
  },
);

test.each([
  [
    'zhipu',
    { web_search: [{ title: 'A', link: 'https://example.com/a', refer: 'ref_1' }] },
    'Answer',
    'Answer',
  ],
  [
    'dashscope',
    { search_info: { search_results: [{ index: 1, title: 'A', url: 'https://example.com/a' }] } },
    'Answer',
    'Answer',
  ],
  [
    'perplexity',
    {
      citations: ['https://example.com/a'],
      search_results: [{ title: 'A', url: 'https://example.com/a' }],
    },
    'Answer [1] and list[2]',
    'Answer [cite:chat-1] and list[2]',
  ],
  [
    'openrouter',
    {
      choices: [
        {
          delta: {
            annotations: [
              {
                type: 'url_citation',
                url_citation: {
                  url: 'https://example.com/a',
                  title: 'A',
                  start_index: 0,
                  end_index: 6,
                },
              },
            ],
          },
        },
      ],
    },
    'Answer',
    'Answer[cite:chat-1]',
  ],
] as const)('collects %s sources from Chat Completions chunks', (dialect, chunk, text, shown) => {
  const capture = new PiWebResponse('chat', dialect);
  capture.observe(chunk);
  capture.observe(chunk);
  const result = readPiWebResult(capture.settle(message(text)));
  expect(result?.sources).toEqual([
    { sourceId: 'chat-1', url: 'https://example.com/a', title: 'A' },
  ]);
  expect(result?.texts).toEqual(shown === text ? [] : [{ contentIndex: 0, text: shown }]);
});

test('returns Gemini server-side tool parts beside the blocks they preceded', () => {
  const capture = new PiWebResponse('native-turn-9', 'google');
  const call = { toolCall: { toolType: 'GOOGLE_SEARCH_WEB', args: { queries: ['q'] }, id: 'a1' } };
  const response = { toolResponse: { toolType: 'GOOGLE_SEARCH_WEB', response: {}, id: 'a1' } };
  capture.observe({
    candidates: [
      {
        content: {
          parts: [
            { text: 'Thinking', thought: true },
            { ...call, thoughtSignature: 'sig-1' },
            { ...response, thoughtSignature: 'sig-2' },
            { text: 'Answer ' },
          ],
        },
      },
    ],
  });
  // A later chunk continues the same text block before the function call.
  capture.observe({
    candidates: [
      { content: { parts: [{ text: 'done' }, { functionCall: { name: 'read_file' } }] } },
    ],
  });
  const answer: AssistantMessage = {
    ...message('Answer done'),
    api: 'google-generative-ai',
    content: [
      { type: 'thinking', thinking: 'Thinking' },
      { type: 'text', text: 'Answer done' },
      { type: 'toolCall', id: 'call-1', name: 'read_file', arguments: {} },
    ],
  };
  const settled = capture.settle(answer);
  const result = readPiWebResult(settled)!;
  expect(result.googleParts).toEqual([
    { before: 1, offsetBefore: 8, part: { ...call, thoughtSignature: 'sig-1' } },
    { before: 1, offsetBefore: 8, part: { ...response, thoughtSignature: 'sig-2' } },
  ]);

  const model = { api: 'google-generative-ai', provider: 'test', id: 'test' } as Model<Api>;
  const sourceFacts = (settled.content[result.replayIndex!] as { text: string }).text;
  const parts = [
    { thought: true, text: 'Thinking' },
    { text: 'Answer done' },
    { text: sourceFacts },
    { functionCall: { name: 'read_file', args: {} } },
  ];
  const contents = [
    { role: 'user', parts: [{ text: 'Question' }] },
    { role: 'model', parts },
  ];
  expect(applyPiWebReplay({ contents }, model, [settled])).toEqual({
    contents: [
      contents[0],
      {
        role: 'model',
        parts: [
          parts[0],
          { ...call, thoughtSignature: 'sig-1' },
          { ...response, thoughtSignature: 'sig-2' },
          ...parts.slice(1),
        ],
      },
    ],
  });
  // Signatures belong to the model that produced them; another model gets plain history.
  expect(applyPiWebReplay({ contents }, { ...model, id: 'other' }, [settled])).toEqual({
    contents,
  });
});

test('replays stored Gemini tool parts without text-boundary metadata', () => {
  const call = { toolCall: { toolType: 'GOOGLE_SEARCH_WEB', args: {}, id: 'old-call' } };
  const sourceFacts = '(lookup old-response; sources)';
  const stored: AssistantMessage = {
    ...message('Answer'),
    api: 'google-generative-ai',
    content: [
      { type: 'text', text: 'Answer' },
      { type: 'text', text: sourceFacts },
    ],
    diagnostics: [
      {
        type: 'cherry.web',
        timestamp: 1,
        details: {
          version: 1,
          id: 'old-response',
          sources: [],
          texts: [],
          failed: false,
          replayIndex: 1,
          googleParts: [{ before: 0, part: call }],
        },
      },
    ],
  };
  const model = { api: 'google-generative-ai', provider: 'test', id: 'test' } as Model<Api>;
  const parts = [{ text: 'Answer' }, { text: sourceFacts }];
  expect(applyPiWebReplay({ contents: [{ role: 'model', parts }] }, model, [stored])).toEqual({
    contents: [{ role: 'model', parts: [call, ...parts] }],
  });
});

test('keeps Gemini tool boundaries after an omitted whitespace-only block', () => {
  const capture = new PiWebResponse('blank', 'google');
  const call = { toolCall: { toolType: 'GOOGLE_SEARCH_WEB', args: {}, id: 'call' } };
  capture.observe({
    candidates: [
      { content: { parts: [{ text: '  ' }, call, { text: 'Thinking', thought: true }] } },
    ],
  });
  const settled = capture.settle({
    ...message(''),
    api: 'google-generative-ai',
    content: [
      { type: 'text', text: '  ' },
      { type: 'thinking', thinking: 'Thinking' },
    ],
  });
  const web = readPiWebResult(settled)!;
  const sourceFacts = (settled.content[web.replayIndex!] as { text: string }).text;
  const model = { api: 'google-generative-ai', provider: 'test', id: 'test' } as Model<Api>;
  const thinking = { text: 'Thinking', thought: true };
  expect(
    applyPiWebReplay(
      { contents: [{ role: 'model', parts: [thinking, { text: sourceFacts }] }] },
      model,
      [settled],
    ),
  ).toEqual({
    contents: [{ role: 'model', parts: [call, thinking, { text: sourceFacts }] }],
  });
});
