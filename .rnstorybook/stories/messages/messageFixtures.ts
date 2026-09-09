import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';

import type { MessageListItem } from '@/frontend/components/Message';
import { createTextPreview } from '@/shared/utils/textPreview';

export const STORY_FILE_ENTRY_ID = '00000000-0000-7000-8000-000000000101';
export const STORY_WRITTEN_FILE_ENTRY_ID = '00000000-0000-7000-8000-000000000102';
export const STORY_EDITED_FILE_ENTRY_ID = '00000000-0000-7000-8000-000000000103';

export type MessageExample = {
  label: string;
  message: MessageListItem;
};

const markdown = [
  '## Messages',
  '',
  'A complete response with **emphasis**, `inline code`, and [a source](https://cherry-ai.com).',
  '',
  '- Stable schema adapters',
  '- Shared CherryUI primitives',
  '',
  '| Part | State |',
  '| --- | --- |',
  '| Markdown | Ready |',
  '| Tools | Complete |',
  '',
  '```ts',
  'const answer = 42;',
  '```',
  '',
  '$$',
  '\\int_0^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}',
  '$$',
].join('\n');

const managedAttachment: CherryMessagePart = {
  filename: 'cherry-studio.png',
  mediaType: 'image/png',
  providerMetadata: { cherry: { fileEntryId: STORY_FILE_ENTRY_ID } },
  type: 'file',
  url: 'file:///storybook/cherry-studio.png',
};

const webSearchParts: CherryMessagePart[] = [
  {
    input: { query: 'Cherry Studio' },
    state: 'input-available',
    toolCallId: 'web-search-running',
    toolName: 'web_search',
    type: 'dynamic-tool',
  },
  {
    input: { query: 'Cherry Studio' },
    output: {
      results: [
        { id: 'result-1', title: 'Cherry Studio', url: 'https://cherry-ai.com' },
        { id: 'result-2', title: 'Documentation', url: 'https://docs.cherry-ai.com' },
      ],
    },
    state: 'output-available',
    toolCallId: 'web-search-complete',
    toolName: 'web_search',
    type: 'dynamic-tool',
  },
];

const toolParts: CherryMessagePart[] = [
  {
    input: { expression: '21 * 2' },
    state: 'input-available',
    title: 'Calculator',
    toolCallId: 'generic-running',
    toolName: 'calculator',
    type: 'dynamic-tool',
  },
  {
    input: { expression: '21 * 2' },
    output: { value: 42 },
    state: 'output-available',
    title: 'Calculator',
    toolCallId: 'generic-complete',
    toolName: 'calculator',
    type: 'dynamic-tool',
  },
  {
    input: { path: '/Documents/project-plan.md' },
    output: { content: [{ text: '# Project Plan\n\n- Define scope\n- Ship UI', type: 'text' }] },
    state: 'output-available',
    toolCallId: 'mcp-complete',
    toolMetadata: { cherry: { tool: { serverName: 'Filesystem', type: 'mcp' } } },
    toolName: 'read_file',
    type: 'dynamic-tool',
  },
];

const writeFileParts: CherryMessagePart[] = [
  {
    input: { content: '# Release Notes\n', filename: 'release-notes.md' },
    state: 'input-available',
    toolCallId: 'write-file-running',
    toolName: 'write_file',
    type: 'dynamic-tool',
  },
  {
    input: { content: '# Release Notes\n', filename: 'release-notes.md' },
    output: {
      fileEntryId: STORY_WRITTEN_FILE_ENTRY_ID,
      filename: 'release-notes.md',
      size: 128,
      status: 'created',
    },
    state: 'output-available',
    toolCallId: 'write-file-complete',
    toolName: 'write_file',
    type: 'dynamic-tool',
  },
  // The Runtime emits the written file straight after its tool result, and the
  // message keeps it there.
  {
    filename: 'release-notes.md',
    mediaType: 'text/markdown',
    providerMetadata: { cherry: { fileEntryId: STORY_WRITTEN_FILE_ENTRY_ID } },
    type: 'file',
    url: `cherry://file/${STORY_WRITTEN_FILE_ENTRY_ID}`,
  },
  {
    input: { content: '...', filename: 'notes/report.md' },
    output: {
      message: 'Invalid filename: give a plain name with an extension, such as `report.md`.',
      status: 'error',
    },
    state: 'output-available',
    toolCallId: 'write-file-rejected',
    toolName: 'write_file',
    type: 'dynamic-tool',
  },
];

const FILE_PROCESS_INPUT = {
  filename: '雷霆战机.html',
  content: [
    '<script>',
    'const enemies = [',
    ...Array.from({ length: 64 }, (_, index) => `  { x: ${index * 12}, y: 0 },`),
    '];',
    'function loop() {',
    '  enemies.forEach(drawEnemy);',
    '  drawPlayer();',
    '  requestAnimationFrame(loop);',
    '}',
    'loop();',
    '</script>',
  ].join('\n'),
};

const fileProcessParts: CherryMessagePart[] = [
  { state: 'done', text: '先创建游戏页面，再检查绘制循环。', type: 'reasoning' },
  {
    input: FILE_PROCESS_INPUT,
    output: { filename: FILE_PROCESS_INPUT.filename, status: 'created' },
    state: 'output-available',
    toolCallId: 'file-process-write',
    toolName: 'write_file',
    type: 'dynamic-tool',
  },
  { state: 'done', text: '检查游戏结束时的画面更新。', type: 'reasoning' },
  { state: 'done', text: '游戏结束后仍在绘制玩家，需要修复这一处。', type: 'text' },
  {
    input: {
      file_entry_id: STORY_WRITTEN_FILE_ENTRY_ID,
      old_string: '  drawPlayer();',
      new_string: "  if (state !== 'over') drawPlayer();",
      replace_all: false,
    },
    output: { filename: FILE_PROCESS_INPUT.filename, replacements: 1, status: 'edited' },
    state: 'output-available',
    toolCallId: 'file-process-edit',
    toolName: 'edit_file',
    type: 'dynamic-tool',
  },
  { state: 'done', text: '已完成游戏页面，并修复结束状态的绘制逻辑。', type: 'text' },
];

const readFileProcessParts: CherryMessagePart[] = Array.from(
  { length: 3 },
  (_, index): CherryMessagePart[] => [
    { state: 'done', text: '检查文件中的状态保存逻辑。', type: 'reasoning' },
    { state: 'done', text: '\n', type: 'text' },
    {
      input: { file_entry_id: STORY_WRITTEN_FILE_ENTRY_ID },
      output: {
        filename: 'game.html',
        lineCount: 40,
        startLine: index * 40 + 1,
        totalLines: 120,
        status: 'ok',
      },
      state: 'output-available',
      toolCallId: `file-process-read-${index}`,
      toolName: 'read_file',
      type: 'dynamic-tool',
    },
  ],
).flat();

const editFileParts: CherryMessagePart[] = [
  {
    input: {
      file_entry_id: STORY_WRITTEN_FILE_ENTRY_ID,
      old_string: 'Draft',
      new_string: 'Final',
      replace_all: false,
    },
    state: 'input-available',
    toolCallId: 'edit-file-running',
    toolName: 'edit_file',
    type: 'dynamic-tool',
  },
  {
    input: {
      file_entry_id: STORY_WRITTEN_FILE_ENTRY_ID,
      old_string: 'Draft',
      new_string: 'Final',
      replace_all: false,
    },
    output: {
      fileEntryId: STORY_EDITED_FILE_ENTRY_ID,
      filename: 'release-notes.md',
      replacements: 1,
      size: 126,
      sourceFileEntryId: STORY_WRITTEN_FILE_ENTRY_ID,
      status: 'edited',
    },
    state: 'output-available',
    toolCallId: 'edit-file-complete',
    toolName: 'edit_file',
    type: 'dynamic-tool',
  },
  {
    filename: 'release-notes.md',
    mediaType: 'text/markdown',
    providerMetadata: { cherry: { fileEntryId: STORY_EDITED_FILE_ENTRY_ID } },
    type: 'file',
    url: `cherry://file/${STORY_EDITED_FILE_ENTRY_ID}`,
  },
  {
    input: {
      file_entry_id: STORY_WRITTEN_FILE_ENTRY_ID,
      old_string: 'Missing',
      new_string: 'Present',
      replace_all: false,
    },
    output: { message: 'old_string was not found in the source file.', status: 'error' },
    state: 'output-available',
    toolCallId: 'edit-file-rejected',
    toolName: 'edit_file',
    type: 'dynamic-tool',
  },
];

const metaToolParts: CherryMessagePart[] = [
  {
    input: { namespace: 'browser', query: 'open url' },
    output: {
      matchedNamespaces: [
        {
          namespace: 'browser',
          tools: [{ name: 'open_url' }, { name: 'screenshot' }],
        },
      ],
    },
    state: 'output-available',
    toolCallId: 'meta-search',
    toolName: 'tool_search',
    type: 'dynamic-tool',
  },
  {
    input: { name: 'browser.open_url' },
    output: '/** Open a URL in the in-app browser. */',
    state: 'output-available',
    toolCallId: 'meta-inspect',
    toolName: 'tool_inspect',
    type: 'dynamic-tool',
  },
  {
    input: { name: 'browser.screenshot', params: { fullPage: false } },
    output: { format: 'png', ok: true },
    state: 'output-available',
    toolCallId: 'meta-invoke',
    toolName: 'tool_invoke',
    type: 'dynamic-tool',
  },
  {
    input: { code: 'return [1, 2, 3].reduce((sum, value) => sum + value, 0);' },
    output: { logs: ['total=6'], result: 6 },
    state: 'output-available',
    toolCallId: 'meta-exec',
    toolName: 'tool_exec',
    type: 'dynamic-tool',
  },
];

export const messageExamples: readonly MessageExample[] = [
  {
    label: 'User message',
    message: createMessage('user-text', 'user', [
      { state: 'done', text: 'Summarize this plan.', type: 'text' },
    ]),
  },
  {
    label: 'User attachment',
    message: createMessage('user-attachment', 'user', [
      managedAttachment,
      { state: 'done', text: 'What stands out in this image?', type: 'text' },
    ]),
  },
  {
    label: 'Pending response',
    message: createMessage('assistant-pending', 'assistant', [], 'pending'),
  },
  {
    label: 'Markdown',
    message: createMessage('assistant-markdown', 'assistant', [
      { state: 'done', text: markdown, type: 'text' },
    ]),
  },
  {
    label: 'Reasoning',
    message: createMessage(
      'assistant-reasoning',
      'assistant',
      [
        {
          state: 'streaming',
          text: 'Comparing the available context and checking each constraint.',
          type: 'reasoning',
        },
        {
          providerMetadata: { cherry: { thinkingMs: 4800 } },
          state: 'done',
          text: 'The message boundary can stay independent from virtualization.',
          type: 'reasoning',
        },
      ],
      'pending',
    ),
  },
  {
    label: 'Translation and data parts',
    message: createMessage('assistant-data', 'assistant', [
      {
        data: { content: 'const greeting = "Hello, Cherry";', language: 'ts' },
        type: 'data-code',
      },
      {
        data: {
          compactedContent: 'The complete earlier conversation.',
          content: '**Conversation compacted:** Earlier messages were summarized.',
        },
        type: 'data-compact',
      },
      {
        data: {
          content: 'This response was translated into English.',
          sourceLanguage: 'zh',
          targetLanguage: 'en',
        },
        type: 'data-translation',
      },
    ]),
  },
  {
    label: 'Error, source, and unknown',
    message: createMessage('assistant-feedback', 'assistant', [
      {
        data: { code: 'REQUEST_FAILED', message: 'The provider returned an invalid response.' },
        type: 'data-error',
      },
      {
        sourceId: 'source-1',
        title: 'Cherry Studio documentation',
        type: 'source-url',
        url: 'https://docs.cherry-ai.com',
      },
      { type: 'data-future' } as unknown as CherryMessagePart,
    ]),
  },
  {
    label: 'Web search tools',
    message: createMessage('assistant-web-search', 'assistant', webSearchParts),
  },
  {
    label: 'Generic and MCP tools',
    message: createMessage('assistant-tools', 'assistant', toolParts),
  },
  {
    label: 'Written file',
    message: createMessage('assistant-write-file', 'assistant', writeFileParts),
  },
  {
    label: 'Edited file',
    message: createMessage('assistant-edit-file', 'assistant', editFileParts),
  },
  {
    label: 'Reasoning and file reads — live process spacing',
    message: createMessage(
      'assistant-read-process-live',
      'assistant',
      readFileProcessParts,
      'pending',
    ),
  },
  {
    label: 'Reasoning and file reads — expand completed process',
    message: createMessage('assistant-read-process-complete', 'assistant', [
      ...readFileProcessParts,
      { state: 'done', text: '已找到问题，接下来修复状态保存逻辑。', type: 'text' },
    ]),
  },
  {
    label: 'File generation — live preview',
    message: createMessage(
      'assistant-file-streaming',
      'assistant',
      [
        fileProcessParts[0]!,
        {
          input: { filename: FILE_PROCESS_INPUT.filename },
          inputPreview: createTextPreview(FILE_PROCESS_INPUT.content),
          state: 'input-streaming',
          toolCallId: 'file-streaming-write',
          toolName: 'write_file',
          type: 'dynamic-tool',
        },
      ],
      'pending',
    ),
  },
  {
    label: 'File generation — single-line source stays passive',
    message: createMessage(
      'assistant-file-minified',
      'assistant',
      [
        {
          input: { filename: 'game.js' },
          inputPreview: createTextPreview('requestAnimationFrame(loop);'.repeat(400)),
          state: 'input-streaming',
          toolCallId: 'file-minified-write',
          toolName: 'write_file',
          type: 'dynamic-tool',
        },
      ],
      'pending',
    ),
  },
  {
    label: 'File generation — complete minified source in a capped viewport',
    message: createMessage('assistant-file-minified-complete', 'assistant', [
      {
        input: { filename: 'game.js', content: 'requestAnimationFrame(loop);'.repeat(4_000) },
        output: { filename: 'game.js', status: 'created' },
        state: 'output-available',
        toolCallId: 'file-minified-complete-write',
        toolName: 'write_file',
        type: 'dynamic-tool',
      },
    ]),
  },
  {
    label: 'File generation — expand process to inspect step spacing',
    message: {
      ...createMessage('assistant-file-process', 'assistant', fileProcessParts),
      stats: { runtimeTiming: { startedAt: 0, completedAt: 94_000, spans: [] } },
    },
  },
  {
    label: 'Meta tools',
    message: createMessage('assistant-meta-tools', 'assistant', metaToolParts),
  },
];

function createMessage(
  id: string,
  role: MessageListItem['role'],
  parts: CherryMessagePart[],
  status: MessageListItem['status'] = 'success',
): MessageListItem {
  return { data: { parts }, id, role, status };
}
