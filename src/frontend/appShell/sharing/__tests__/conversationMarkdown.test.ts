import type { TranscriptMessage } from '@/frontend/appShell/conversation';

import {
  conversationToMarkdown,
  ConversationExportError,
  type ConversationExportLabels,
} from '../conversationMarkdown';

const labels: ConversationExportLabels = {
  title: 'Conversation',
  user: 'You',
  assistant: 'Assistant',
  reasoning: 'Thinking process',
  response: 'Response',
  file: 'File',
  sources: 'Sources',
  status: 'Status',
  messageStatuses: {
    pending: 'Pending',
    streaming: 'Streaming',
    success: 'Completed',
    error: 'Failed',
    cancelled: 'Cancelled',
    interrupted: 'Interrupted',
  },
};

function message(id: string, parts: TranscriptMessage['parts']): TranscriptMessage {
  return { id, role: 'assistant', status: 'success', stats: null, parts };
}

test('keeps prose and reasoning in their original order while omitting tool inputs and results', () => {
  const answer = message('answer', [
    { id: 'thought-1', type: 'reasoning', text: 'First thought', state: 'done' },
    { id: 'prose', type: 'text', text: 'Let me check the document.', state: 'done' },
    {
      id: 'tool',
      type: 'dynamic-tool',
      toolCallId: 'call',
      toolRef: { source: 'builtin', capabilityId: 'read_file' },
      toolName: 'read_file',
      title: 'Read file',
      state: 'output-available',
      input: { path: 'private-input.txt' },
      output: { value: 'private-tool-result', artifacts: [] },
    },
    { id: 'thought-2', type: 'reasoning', text: 'Second thought', state: 'done' },
    {
      id: 'final',
      type: 'text',
      text: 'Final answer\n\n```ts\nconst value = 1;\n```',
      state: 'done',
    },
  ]);
  const markdown = conversationToMarkdown({ title: 'My conversation', messages: [answer] }, labels);

  expect(markdown).toContain('# My conversation');
  expect(markdown).toContain('### Thinking process\n\nFirst thought');
  expect(markdown.indexOf('First thought')).toBeLessThan(markdown.indexOf('Let me check'));
  expect(markdown.indexOf('Let me check')).toBeLessThan(markdown.indexOf('Second thought'));
  expect(markdown.indexOf('Second thought')).toBeLessThan(markdown.indexOf('Final answer'));
  expect(markdown).toContain('```ts\nconst value = 1;\n```');
  expect(markdown).not.toMatch(/private-input|private-tool-result|read_file|Read file|<details/);
});

test('preserves portable citations, including a source cited again in a later message', () => {
  const first = message('first', [
    {
      id: 'source',
      type: 'source-url',
      sourceId: 'page',
      title: 'Documentation',
      url: 'https://example.com/docs',
    },
    { id: 'answer', type: 'text', text: 'Source [cite:page].', state: 'done' },
  ]);
  const next = message('next', [
    {
      id: 'again',
      type: 'reasoning',
      text: 'Recheck [cite:page], keep `[cite:page]` literal.',
      state: 'done',
    },
  ]);
  const markdown = conversationToMarkdown({ messages: [first, next] }, labels);

  expect(markdown).toContain('Source [1](<https://example.com/docs>).');
  expect(markdown).toContain(
    'Recheck [1](<https://example.com/docs>), keep `[cite:page]` literal.',
  );
  expect(markdown).toContain('[Documentation](<https://example.com/docs>)');
});

test('adapts saved web-search results to shared citations without exporting tool bodies', () => {
  const markdown = conversationToMarkdown(
    {
      messages: [
        message('answer', [
          {
            id: 'search',
            type: 'dynamic-tool',
            toolCallId: 'call',
            toolRef: { source: 'builtin', capabilityId: 'web_search' },
            toolName: 'web_search',
            state: 'output-available',
            input: { query: 'private search query' },
            output: {
              value: {
                details: {
                  results: [
                    {
                      id: 'one',
                      title: 'A',
                      url: 'https://example.com/a',
                      content: 'private body',
                    },
                    { id: 'two', title: 'B', url: 'https://example.com/b' },
                  ],
                },
              },
              artifacts: [],
            },
          },
          { id: 'text', type: 'text', text: 'Answer [cite:two].', state: 'done' },
        ]),
      ],
    },
    labels,
  );

  expect(markdown).toContain('Answer [2](<https://example.com/b>).');
  expect(markdown).toContain('1. [A](<https://example.com/a>)');
  expect(markdown).toContain('2. [B](<https://example.com/b>)');
  expect(markdown).not.toMatch(/private search query|private body|web_search/);
});

test('expands full saved quotes at their inline positions with the recorded author and citations', () => {
  const firstLabel = '“Original excerpt…”';
  const secondLabel = '“Another excerpt…”';
  const text = `Before ${firstLabel} between ${secondLabel} after.`;
  const longExcerpt = `Original excerpt ${'x'.repeat(256)}`;
  const markdown = conversationToMarkdown(
    {
      messages: [
        message('source', [
          {
            id: 'source-url',
            type: 'source-url',
            sourceId: 'page',
            title: 'Documentation',
            url: 'https://example.com/docs',
          },
        ]),
        {
          ...message('question', [
            {
              id: 'question-text',
              type: 'text',
              state: 'done',
              text,
              quotes: [
                {
                  id: 'first-quote',
                  sourceMessageId: '00000000-0000-7000-8000-000000000001',
                  text: `${longExcerpt}\nSaved source [cite:page].`,
                  reference: { label: firstLabel, offset: text.indexOf(firstLabel) },
                },
                {
                  id: 'second-quote',
                  sourceMessageId: '00000000-0000-7000-8000-000000000002',
                  text: 'Second complete snapshot.',
                  reference: { label: secondLabel, offset: text.indexOf(secondLabel) },
                },
              ],
              quoteAuthor: { role: 'assistant', name: 'Saved *Agent*' },
            },
          ]),
          role: 'user',
        },
      ],
    },
    labels,
  );

  expect(markdown).toContain(
    `Before \n\n> **Saved \\*Agent\\***\n>\n> ${longExcerpt}\n> Saved source [1](<https://example.com/docs>).\n\n between \n\n> **Saved \\*Agent\\***\n>\n> Second complete snapshot.\n\n after.`,
  );
  expect(markdown).not.toContain(firstLabel);
  expect(markdown).not.toContain(secondLabel);
});

test('keeps older leading quotes in order when an attachment-only prompt has no text', () => {
  const markdown = conversationToMarkdown(
    {
      messages: [
        {
          ...message('question', [
            {
              id: 'quoted-text',
              type: 'text',
              state: 'done',
              text: '',
              quotes: [
                {
                  id: 'first-quote',
                  sourceMessageId: '00000000-0000-7000-8000-000000000001',
                  text: 'First saved passage\n\n```ts\nconst value = 1;\n```',
                },
                {
                  id: 'second-quote',
                  sourceMessageId: '00000000-0000-7000-8000-000000000002',
                  text: 'Second saved passage',
                },
              ],
              quoteAuthor: { role: 'assistant' },
            },
            {
              id: 'file',
              type: 'file',
              fileEntryId: '00000000-0000-7000-8000-000000000003',
              filename: 'image.png',
              mediaType: 'image/png',
              purpose: 'input-attachment',
            },
          ]),
          role: 'user',
        },
      ],
    },
    labels,
  );

  expect(markdown).toContain(
    '> **Assistant**\n>\n> First saved passage\n>\n> ```ts\n> const value = 1;\n> ```\n\n> **Assistant**\n>\n> Second saved passage\n\n- File: image\\.png',
  );
});

test('exports long conversations without the sharing selection or document rendering limits', () => {
  const messages = Array.from({ length: 300 }, (_, index) =>
    message(String(index), [
      { id: `part-${index}`, type: 'text', text: `Message ${index}`, state: 'done' },
    ]),
  );
  messages[150].parts = [
    { id: 'long', type: 'reasoning', text: '思'.repeat(500_001), state: 'done' },
  ];
  const markdown = conversationToMarkdown({ messages }, labels);

  expect(markdown.match(/^## Assistant$/gm)).toHaveLength(300);
  expect(markdown).toContain('Message 0');
  expect(markdown).toContain('Message 299');
  expect(markdown).toContain('思'.repeat(500_001));
});

test('keeps attachment names and terminal status without exporting system content or diagnostics', () => {
  const answer = message('answer', [
    {
      id: 'file',
      type: 'file',
      filename: 'report.pdf',
      fileEntryId: 'private-file-id',
      mediaType: 'application/pdf',
      purpose: 'input-attachment',
    },
    {
      id: 'error',
      type: 'data-error',
      data: { code: 'EXECUTION_FAILED', message: 'Private runtime diagnostics', retryable: false },
    },
  ]);
  const markdown = conversationToMarkdown(
    {
      assistantName: 'Research Agent',
      messages: [
        {
          ...message('system', [
            { id: 'secret', type: 'text', text: 'Private system content', state: 'done' },
          ]),
          role: 'system',
        },
        {
          ...answer,
          status: 'cancelled',
          modelName: 'Model',
          attachments: [{ name: 'remote.txt' }],
        },
      ],
    },
    labels,
  );

  expect(markdown).toContain('## Research Agent · Model');
  expect(markdown).toContain('Status: Cancelled');
  expect(markdown).toContain('File: report\\.pdf');
  expect(markdown).toContain('File: remote\\.txt');
  expect(markdown).not.toMatch(/Private system|Private runtime|private-file-id/);
});

test('rejects empty and unfinished transcripts instead of silently exporting a partial history', () => {
  expect(() => conversationToMarkdown({ messages: [] }, labels)).toThrow(ConversationExportError);
  expect(() =>
    conversationToMarkdown(
      { messages: [{ ...message('pending', []), status: 'streaming' }] },
      labels,
    ),
  ).toThrow('unsettled');
});
