import {
  remoteMessage,
  remoteTranscriptMessage,
} from '@/frontend/appShell/conversation/remote/remoteConversationViews';
import { createRemoteMessageCitationMaterializer } from '@/frontend/appShell/conversation/remote/remoteMessageCitations';
import { resolveCitationWebSources } from '@/frontend/components/Message/parts/webSource';
import { copyAssistantMessageText } from '@/frontend/features/chat/components/ChatWorkspace/utils/copyAssistantMessageText';
import { resolveMessageCitations } from '@/frontend/utils/messageCitations';
import { replaceCitationMarkers } from '@/frontend/utils/messageCitations';
import type { AgentMessageView } from '@/shared/contracts/agent';
import { DOCUMENT_EXPORT_MAX_SECTIONS } from '@/shared/contracts/documentExport';
import type { RemoteMessageView } from '@/shared/contracts/remoteAgent';
import { messageTranslationText } from '@/shared/utils/messageTranslation';
import { sha256HexOfText } from '@/shared/utils/sha256';

import { prepareChatExport } from '../prepareChatExport';
import { toChatExportDocument, type ChatExportOptions } from '../toChatExportDocument';

const options: ChatExportOptions = {
  title: 'Conversation',
  labels: {
    user: 'You',
    assistant: 'Assistant',
    sources: (count) => `${count} sources`,
    file: 'File',
    status: 'Status',
    translation: (language) => `Translation (${language})`,
    messageStatuses: {
      pending: 'Pending',
      streaming: 'Streaming',
      success: 'Success',
      error: 'Failed',
      cancelled: 'Cancelled',
      interrupted: 'Interrupted',
    },
  },
};
function message(
  id: string,
  role: 'user' | 'assistant',
  parts: AgentMessageView['parts'],
): AgentMessageView {
  return {
    id,
    role,
    parts,
    sessionId: 'session',
    turnId: 'turn',
    status: 'success',
    createdAt: '2026-09-11T00:00:00.000Z',
    updatedAt: '2026-09-11T00:00:00.000Z',
    stats: null,
    modelId: null,
    inferenceSnapshot: null,
  };
}
const answer = message('b', 'assistant', [
  { id: 'early', type: 'text', text: 'Let me check.', state: 'done' },
  { id: 'reason', type: 'reasoning', text: 'Private reasoning', state: 'done' },
  { id: 'final', type: 'text', text: 'Final answer', state: 'done' },
  {
    id: 'file',
    type: 'file',
    fileEntryId: '00000000-0000-4000-8000-000000000001',
    mediaType: 'image/png',
    filename: 'Photo',
    purpose: 'artifact',
  },
]);
const question = message('a', 'user', [
  { id: 'question', type: 'text', text: 'Question?', state: 'done' },
]);

test('expanded translations follow only selected messages, without exporting reasoning', () => {
  const document = toChatExportDocument([question, answer], {
    ...options,
    translations: {
      b: {
        sourceHash: sha256HexOfText(messageTranslationText(answer.parts)!),
        language: 'zh-CN',
        content: '当前语言译文',
      },
      unselected: { sourceHash: 'a'.repeat(64), language: 'fr-FR', content: 'Unselected' },
    },
  });
  expect(document.sections).toHaveLength(2);
  expect(JSON.stringify(document.sections[1])).toContain('当前语言译文');
  expect(JSON.stringify(document.sections[0])).not.toContain('当前语言译文');
  expect(JSON.stringify(document)).not.toContain('Unselected');
  expect(JSON.stringify(document)).not.toContain('Private reasoning');
});

test('saved translations stay out of sharing when folded, and stale translations never accompany changed text', () => {
  const saved: AgentMessageView = {
    ...answer,
    translations: {
      sourceHash: sha256HexOfText(messageTranslationText(answer.parts)!),
      results: {
        'zh-CN': { content: '中文缓存', createdAt: 1 },
        'fr-FR': { content: 'French cache', createdAt: 2 },
      },
    },
  };
  expect(JSON.stringify(toChatExportDocument([saved], options))).not.toContain('中文缓存');
  const changed = {
    ...answer,
    parts: [{ id: 'new', type: 'text' as const, text: 'Changed', state: 'done' as const }],
  };
  const document = toChatExportDocument([changed], {
    ...options,
    translations: {
      b: { sourceHash: saved.translations!.sourceHash, language: 'zh-CN', content: '旧译文' },
    },
  });
  expect(JSON.stringify(document)).not.toContain('旧译文');
  expect(JSON.stringify(document)).toContain('Changed');
});

test('exports native citations and preserves the final answer before source metadata', () => {
  const native = message('native', 'assistant', [
    { id: 'answer', type: 'text', text: 'Answer [cite:native-1]', state: 'done' },
    {
      id: 'source',
      type: 'source-url',
      sourceId: 'native-1',
      title: 'A',
      url: 'https://example.com/a',
    },
    {
      id: 'suggestions',
      type: 'data-search-suggestions',
      data: { html: '<div>Suggestions</div>' },
    },
  ]);
  expect(toChatExportDocument([native], options).sections[0].blocks).toEqual([
    { kind: 'markdown', source: 'Answer [1](<https://example.com/a>)' },
    {
      kind: 'links',
      summary: '1 sources',
      items: [{ label: '1. A', url: 'https://example.com/a' }],
    },
  ]);
});

test('disabling process includes the final answer and files but excludes earlier process text', () => {
  const document = toChatExportDocument([question, answer], options);
  expect(document.sections.map((section) => section.heading)).toEqual(['You', 'Assistant']);
  expect(document.sections[1].blocks).toEqual([
    { kind: 'markdown', source: 'Final answer' },
    { kind: 'image', assetId: 'b:file', alt: 'Photo' },
  ]);
  expect(JSON.stringify(document)).not.toContain('Private reasoning');
  expect(document.assets?.['b:file']).toEqual({
    kind: 'managed-file',
    fileEntryId: '00000000-0000-4000-8000-000000000001',
  });
});

test('answers carry the Cherry avatar and their own model; questions stay plain bubbles', () => {
  const document = toChatExportDocument(
    [question, { ...answer, modelName: 'GPT-5' }, { ...answer, id: 'c' }],
    options,
  );
  expect(document.sections[0]).not.toHaveProperty('avatar');
  expect(document.sections[1]).toMatchObject({ avatar: '🍒', model: 'GPT-5' });
  expect(document.sections[2]).toMatchObject({ avatar: '🍒' });
  expect(document.sections[2]).not.toHaveProperty('model');
});

test('process, reasoning and intermediate prose never enter the share document', () => {
  const document = toChatExportDocument([answer], options);
  expect(JSON.stringify(document)).not.toContain('Private reasoning');
  expect(JSON.stringify(document)).not.toContain('Let me check.');
  expect(document.sections[0].blocks.some((block) => block.kind === 'details')).toBe(false);
  expect(document.sections[0].metadata).toEqual([]);
});

test('generated images retain transcript order and their invented preview references are omitted', () => {
  const id = '00000000-0000-4000-8000-000000000002';
  const reference = `![三国名将阵营图](https://preview.cherry.ai/${id})`;
  const text = `${reference}\n\n这张图将三国名将按 **蜀汉 / 曹魏 / 东吴 + 吕布** 四大板块布局。`;
  const generated = message('generated', 'assistant', [
    {
      id: 'image',
      type: 'file',
      fileEntryId: id,
      mediaType: 'image/png',
      filename: '三国名将阵营图',
      purpose: 'artifact',
    },
    { id: 'explanation', type: 'text', text, state: 'done' },
  ]);

  const document = toChatExportDocument([generated], options);

  expect(document.sections[0].blocks).toEqual([
    { kind: 'image', assetId: 'generated:image', alt: '三国名将阵营图' },
    { kind: 'markdown', source: '这张图将三国名将按 **蜀汉 / 曹魏 / 东吴 + 吕布** 四大板块布局。' },
  ]);
  expect(JSON.stringify(document)).not.toContain('preview.cherry.ai');
  expect(generated.parts[1]).toMatchObject({ text });

  const withTrailingReference = {
    ...generated,
    parts: [
      ...generated.parts,
      { id: 'duplicate', type: 'text' as const, text: reference, state: 'done' as const },
    ],
  };
  expect(toChatExportDocument([withTrailingReference], options).sections[0].blocks).toEqual(
    document.sections[0].blocks,
  );
});

test('only duplicate standalone image references are removed, preserving code and unrelated images', () => {
  const id = '00000000-0000-4000-8000-000000000003';
  const reference = `![Generated](https://preview.cherry.ai/${id})`;
  const preserved = `\`\`\`markdown\n${reference}\n\`\`\`\n\n![Other](https://example.com/photo.png)`;
  const generated = message('generated', 'assistant', [
    {
      id: 'image',
      type: 'file',
      fileEntryId: id,
      mediaType: 'image/png',
      filename: 'Generated',
      purpose: 'artifact',
    },
    { id: 'explanation', type: 'text', text: `${reference}\n\n${preserved}`, state: 'done' },
  ]);
  expect(toChatExportDocument([generated], options).sections[0].blocks[1]).toEqual({
    kind: 'markdown',
    source: preserved,
  });
});

test('reasoning after text is still process rather than a final answer', () => {
  const unfinishedAnswer = message('c', 'assistant', answer.parts.slice(0, 2));
  expect(toChatExportDocument([unfinishedAnswer], options).sections[0].blocks).toEqual([]);
});

test('exports only selected messages in reading order, not selection order', async () => {
  const laterAnswer = { ...answer, id: 'd', turnId: 'second-turn' };
  const laterQuestion = { ...question, id: 'c', turnId: 'second-turn' };
  const readPage = jest.fn(async () => ({ items: [laterAnswer, laterQuestion, answer, question] }));
  const messages = await loadChatExportMessages(
    ['d', 'a', 'd'],
    readPage,
    new AbortController().signal,
  );
  expect(messages).toEqual([question, laterAnswer]);
  expect(toChatExportDocument(messages, options).sections.map((section) => section.id)).toEqual([
    'a',
    'd',
  ]);
});

test('selecting an answer does not implicitly include its same-turn question', async () => {
  await expect(
    loadChatExportMessages(
      ['b'],
      async () => ({ items: [answer, question] }),
      new AbortController().signal,
    ),
  ).resolves.toEqual([answer]);
});

test('resolves selected IDs in one bounded read without scanning intervening history', async () => {
  const readPage = jest.fn(async () => ({ items: [answer, question] }));
  await expect(
    loadChatExportMessages(['b', 'a', 'b'], readPage, new AbortController().signal),
  ).resolves.toEqual([question, answer]);
  expect(readPage).toHaveBeenCalledTimes(1);
  expect(readPage).toHaveBeenCalledWith({ ids: ['b', 'a'] });
});

test.each(['pending', 'streaming'] as const)(
  'rejects a selected %s message instead of sharing a subset',
  async (status) => {
    await expect(
      loadChatExportMessages(
        ['a', 'b'],
        async () => ({ items: [{ ...answer, status }, question] }),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'unsettled' });
  },
);

test('rejects missing or system message selections', async () => {
  for (const items of [[answer], [answer, { ...question, role: 'system' as const }]]) {
    await expect(
      loadChatExportMessages(['a', 'b'], async () => ({ items }), new AbortController().signal),
    ).rejects.toMatchObject({ code: 'missing' });
  }
});

test('rejects empty and oversized selections before loading history', async () => {
  const readPage = jest.fn();
  await expect(
    loadChatExportMessages([], readPage, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'empty' });
  await expect(
    loadChatExportMessages(
      Array.from({ length: DOCUMENT_EXPORT_MAX_SECTIONS + 1 }, (_, index) => String(index)),
      readPage,
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: 'size-limit' });
  expect(readPage).not.toHaveBeenCalled();
});

test('admits the document selection limit without truncation', async () => {
  const history = Array.from({ length: DOCUMENT_EXPORT_MAX_SECTIONS }, (_, index) => ({
    ...question,
    id: `message-${index}`,
  }));
  const messages = await loadChatExportMessages(
    history.map((message) => message.id),
    async () => ({ items: history }),
    new AbortController().signal,
  );
  expect(messages).toEqual(history.toReversed());
  expect(toChatExportDocument(messages, options).sections).toHaveLength(history.length);
  expect(() => toChatExportDocument([...messages, answer], options)).toThrow('size-limit');
});

test('cancellation prevents starting the selected-ID read or using its result', async () => {
  const controller = new AbortController();
  const readPage = jest.fn(async () => {
    controller.abort();
    return { items: [answer, question] };
  });
  await expect(
    loadChatExportMessages(['a', 'b'], readPage, controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(readPage).toHaveBeenCalledTimes(1);
  readPage.mockClear();
  await expect(
    loadChatExportMessages(['a', 'b'], readPage, controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(readPage).not.toHaveBeenCalled();
});

test('a failed selected-ID read rejects the export', async () => {
  const failure = new Error('History unavailable');
  const readPage = jest.fn().mockRejectedValueOnce(failure);
  await expect(
    loadChatExportMessages(['a', 'b'], readPage, new AbortController().signal),
  ).rejects.toBe(failure);
});

test('citations become portable links without rewriting fenced, inline or escaped code examples', () => {
  const source = '[cite:one]\n\n~~~md\n[cite:one]\n~~~\n\n`` `[cite:one]` `` and \\[cite:one]';
  const result = replaceCitationMarkers(source, {
    format: 'export',
    numbers: new Map([['one', 1]]),
    sources: new Map([['one', { id: 'one', title: 'Source', url: 'https://example.com/' }]]),
  });
  expect(result).toBe(
    '[1](<https://example.com/>)\n\n~~~md\n[cite:one]\n~~~\n\n`` `[cite:one]` `` and \\[cite:one]',
  );
});

test('multiline inline code and quoted fences retain citation examples', () => {
  const code = '`code\n[cite:one]`\n\n> ```md\n> [cite:one]\n> ```\n\n';
  expect(
    replaceCitationMarkers(`${code}[cite:one]`, {
      format: 'export',
      numbers: new Map([['one', 1]]),
      sources: new Map([['one', { id: 'one', title: 'Source', url: 'https://example.com/' }]]),
    }),
  ).toBe(`${code}[1](<https://example.com/>)`);
});

async function loadChatExportMessages(
  ids: readonly string[],
  readPage: (query: { ids: string[] }) => Promise<{ items: AgentMessageView[] }>,
  signal: AbortSignal,
) {
  const snapshot = await prepareChatExport(
    {
      prepareSelection: async (selected) => {
        const page = await readPage({ ids: [...selected] });
        return {
          messages: page.items.filter((message) => selected.includes(message.id)).toReversed(),
        };
      },
    },
    ids,
    signal,
  );
  return snapshot.messages;
}

test('exports final answer and translations with full-message numbers and original source order', () => {
  const value = message('numbered', 'assistant', [
    { id: 'a-source', type: 'source-url', sourceId: 'a', title: 'A', url: 'https://a.example' },
    { id: 'b-source', type: 'source-url', sourceId: 'b', title: 'B', url: 'https://b.example' },
    { id: 'process', type: 'text', text: 'Process [cite:b]', state: 'done' },
    { id: 'final', type: 'text', text: 'Answer [cite:a]', state: 'done' },
  ]);
  const blocks = toChatExportDocument([value], {
    ...options,
    translations: {
      numbered: {
        sourceHash: sha256HexOfText(messageTranslationText(value.parts)!),
        language: 'zh-CN',
        content: '译文 [cite:a] [cite:b]',
      },
    },
  }).sections[0].blocks;
  expect(blocks).toEqual([
    { kind: 'markdown', source: 'Answer [2](<https://a.example>)' },
    {
      kind: 'links',
      summary: '2 sources',
      items: [
        { label: '2. A', url: 'https://a.example' },
        { label: '1. B', url: 'https://b.example' },
      ],
    },
    {
      kind: 'markdown',
      source:
        '---\n\n### Translation (zh-CN)\n\n译文 [2](<https://a.example>) [1](<https://b.example>)',
    },
  ]);
});

test('exports URL aliases once, leaves unused sources unnumbered and preserves URL-less content', () => {
  const value = message('aliases', 'assistant', [
    {
      id: 'tool',
      type: 'dynamic-tool',
      toolName: 'kb_search',
      title: 'Knowledge search',
      toolRef: { source: 'builtin', capabilityId: 'kb_search' },
      toolCallId: 'call',
      state: 'output-available',
      input: {},
      output: {
        value: [
          { id: 'kb', title: 'Knowledge', content: 'Local excerpt' },
          { id: 'a', title: 'A', url: 'https://a.example' },
          { id: 'alias', title: 'Alias', url: 'https://a.example' },
          { id: 'unused', title: 'Unused', url: 'https://unused.example' },
        ],
        artifacts: [],
      },
    },
    { id: 'final', type: 'text', text: '[cite:kb] [cite:alias] [cite:a]', state: 'done' },
  ]);
  expect(toChatExportDocument([value], options).sections[0].blocks).toEqual([
    { kind: 'markdown', source: '[1] [2](<https://a.example>) [2](<https://a.example>)' },
    {
      kind: 'links',
      summary: '2 sources',
      items: [
        { label: '2. A', url: 'https://a.example' },
        { label: 'Unused', url: 'https://unused.example' },
      ],
    },
    { kind: 'text', text: '1. Knowledge\nLocal excerpt' },
  ]);
});

test('source snapshots exclusively control exported links and numbers, including an empty snapshot', () => {
  const value = message('snapshot', 'assistant', [
    {
      id: 'source',
      type: 'source-url',
      sourceId: 'a',
      title: 'Parts source',
      url: 'https://parts.example',
    },
    { id: 'final', type: 'text', text: 'Answer [cite:a]', state: 'done' },
  ]);
  const citationSources = [
    { id: 'a', title: 'Snapshot', url: 'https://snapshot.example', number: 7 },
  ];
  expect(toChatExportDocument([{ ...value, citationSources }], options).sections[0].blocks).toEqual(
    [
      { kind: 'markdown', source: 'Answer [1](<https://snapshot.example>)' },
      {
        kind: 'links',
        summary: '1 sources',
        items: [{ label: '1. Snapshot', url: 'https://snapshot.example' }],
      },
    ],
  );
  expect(
    toChatExportDocument([{ ...value, citationSources: [] }], options).sections[0].blocks,
  ).toEqual([{ kind: 'markdown', source: 'Answer [cite:a]' }]);
});

it.each(['web', 'url-less', 'alias', 'empty'] as const)(
  'numbers real unnumbered remote snapshots: %s',
  (mode) => {
    const a = { id: 'a', title: 'A', url: 'https://a.example' };
    const b =
      mode === 'url-less'
        ? { id: 'b', title: 'B' }
        : {
            id: 'b',
            title: 'B',
            url: mode === 'alias' ? a.url : 'https://b.example',
          };
    const view: RemoteMessageView = {
      id: 'remote',
      version: '1',
      role: 'assistant',
      state: 'success',
      parts: [
        {
          id: 'process',
          kind: 'text',
          state: 'completed',
          complete: true,
          text: 'Process [cite:b]',
        },
        {
          id: 'tool',
          kind: 'tool',
          callId: 'call',
          name: 'web_search',
          state: 'completed',
          output: 'out',
        },
        { id: 'answer', kind: 'text', state: 'completed', complete: true, text: 'Answer [cite:a]' },
      ],
    };
    const snapshot = remoteTranscriptMessage(view, {
      sourcesByPartId: new Map([['tool', mode === 'empty' ? [] : [b, a]]]),
    });
    expect(snapshot.citationSources?.every((source) => !('number' in source))).toBe(true);
    const blocks = toChatExportDocument([snapshot], options).sections[0].blocks;
    if (mode === 'empty') {
      expect(blocks).toEqual([{ kind: 'markdown', source: 'Answer [cite:a]' }]);
    } else {
      const resolved = resolveMessageCitations(snapshot.parts as never, snapshot.citationSources);
      expect(resolved.sourceNumberById.get('b')).toBe(1);
      expect(resolved.sourceNumberById.get('a')).toBe(mode === 'alias' ? 1 : 2);
      expect(blocks[0]).toEqual({
        kind: 'markdown',
        source: `Answer [${mode === 'alias' ? 1 : 2}](<https://a.example>)`,
      });
      if (mode === 'url-less') expect(blocks).toContainEqual({ kind: 'text', text: '1. B' });
      if (mode === 'alias')
        expect(blocks[1]).toMatchObject({ items: [{ label: '1. B', url: a.url }] });
    }
  },
);

it.each([false, true])(
  'materializes single kb_read objects/envelopes for UI, copy and export (%s)',
  async (envelope) => {
    const kb = { id: 'kb', title: 'Knowledge', content: 'Local excerpt' };
    const view: RemoteMessageView = {
      id: 'kb-message',
      version: '1',
      role: 'assistant',
      state: 'success',
      parts: [
        {
          id: 'tool',
          kind: 'tool',
          callId: 'call',
          name: 'kb_read',
          state: 'completed',
          output: 'kb',
        },
        {
          id: 'answer',
          kind: 'text',
          state: 'completed',
          complete: true,
          text: 'Answer [cite:kb]',
        },
      ],
    };
    const materializer = createRemoteMessageCitationMaterializer({
      resource: () => ({
        kind: 'inline',
        value: {
          kind: 'json',
          complete: true,
          value: envelope ? { artifacts: [], value: kb } : kb,
        },
      }),
    });
    await materializer.materializeAll([view], new AbortController().signal);
    const materialization = materializer.peek(view.id, view.version);
    const parts = remoteMessage(
      view,
      () => ({ kind: 'inline', value: { kind: 'json', complete: true, value: null } }),
      undefined,
      materialization,
    ).display.data.parts!;
    expect(resolveMessageCitations(parts).textByPartIndex.get(1)?.plainText).toBe('Answer [1]');
    expect(copyAssistantMessageText(parts)).toBe('Answer [1]');
    expect(resolveCitationWebSources(parts)).toEqual([]);
    expect(
      toChatExportDocument([remoteTranscriptMessage(view, materialization)], options).sections[0]
        .blocks,
    ).toEqual([
      { kind: 'markdown', source: 'Answer [1]' },
      { kind: 'text', text: '1. Knowledge\nLocal excerpt' },
    ]);
  },
);

it('resolves interleaved native/tool ID conflicts and URL aliases consistently', () => {
  const old = { id: 'a', title: 'Old', url: 'https://old.example' };
  const winner = { id: 'a', title: 'New', url: 'https://new.example' };
  const alias = { id: 'b', title: 'Alias', url: winner.url };
  const view: RemoteMessageView = {
    id: 'conflict',
    version: '1',
    role: 'assistant',
    state: 'success',
    parts: [
      { id: 'native', kind: 'data', name: 'source-url', resource: 'native' },
      {
        id: 'tool',
        kind: 'tool',
        callId: 'call',
        name: 'web_search',
        state: 'completed',
        output: 'tool',
      },
      { id: 'alias', kind: 'data', name: 'source-url', resource: 'alias' },
      { id: 'answer', kind: 'text', state: 'completed', complete: true, text: '[cite:a] [cite:b]' },
    ],
  };
  const materialization = {
    sourcesByPartId: new Map([
      ['native', [old]],
      ['tool', [winner]],
      ['alias', [alias]],
    ]),
  };
  const parts = remoteMessage(
    view,
    () => ({ kind: 'inline', value: { kind: 'json', complete: true, value: null } }),
    undefined,
    materialization,
  ).display.data.parts!;
  expect(resolveCitationWebSources(parts).map((s) => s.url)).toEqual([winner.url]);
  expect(copyAssistantMessageText(parts)).toBe('[1] [1]');
  const snapshot = remoteTranscriptMessage(view, materialization);
  expect(snapshot.citationSources).toEqual([winner]);
  expect(toChatExportDocument([snapshot], options).sections[0].blocks).toEqual([
    { kind: 'markdown', source: '[1](<https://new.example>) [1](<https://new.example>)' },
    { kind: 'links', summary: '1 sources', items: [{ label: '1. New', url: winner.url }] },
  ]);
});
