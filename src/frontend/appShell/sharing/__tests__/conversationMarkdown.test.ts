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
