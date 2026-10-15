import type { ConversationMessage } from '@/frontend/appShell/conversation';
import {
  TranslationError,
  type TranslationInput,
  type TranslationOptions,
} from '@/shared/contracts/translation';
import type { SaveAgentMessageTranslation } from '@/shared/data/api/schemas/agentSessionMessages';
import type { ApiClient } from '@/shared/data/api/types';
import type { MessageTranslations } from '@/shared/data/types/messageTranslation';

import { messageTranslationSource } from '../messageTranslationSource';
import { MessageTranslationStore } from '../MessageTranslationStore';

function message(text = 'Original answer'): ConversationMessage {
  return {
    key: 'answer',
    state: 'success',
    completeness: 'complete',
    actions: {},
    display: {
      id: 'answer',
      role: 'assistant',
      status: 'success',
      data: { parts: [{ type: 'text', text }] },
    },
  };
}
const source = messageTranslationSource(message().display)!;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function persistence() {
  const messages = new Map<string, MessageTranslations>();
  const save = jest.fn(async (path: string, { body }: { body: SaveAgentMessageTranslation }) => {
    const previous = messages.get(path);
    const translations: MessageTranslations = {
      sourceHash: body.sourceHash,
      results: {
        ...(previous?.sourceHash === body.sourceHash ? previous.results : {}),
        [body.language]: { content: body.content, createdAt: Date.now() },
      },
    };
    messages.set(path, translations);
    return translations;
  });
  const api = { patch: save } as unknown as Pick<ApiClient, 'patch'>;
  const stored = (original = source, sessionId = 'session') => ({
    ...original,
    translations: messages.get(
      `/agent-sessions/${sessionId}/messages/${original.messageId}/translations`,
    ),
  });
  const savedResults = () =>
    [...messages.values()].flatMap((message) =>
      Object.entries(message.results).map(([language, result]) => ({ language, ...result })),
    );
  return { api, savedResults, save, stored };
}
function setup() {
  const data = persistence();
  const translate = jest.fn(
    async (_input: TranslationInput, _options?: TranslationOptions) => '译文',
  );
  const translation = { translate };
  const store = new MessageTranslationStore(translation, data.api, 'session');
  return { ...data, translate, translation, store };
}

test('does not translate until invoked, deduplicates clicks and notifies only its row', async () => {
  const { store, translate } = setup();
  const done = deferred<string>();
  translate.mockImplementationOnce(() => done.promise);
  const changed = jest.fn();
  const other = jest.fn();
  store.subscribe('answer', changed);
  store.subscribe('other', other);
  expect(store.get(source).status).toBe('idle');
  store.toggle(source);
  expect(store.get(source).visible).toBe(false);
  expect(translate).not.toHaveBeenCalled();
  const pending = store.start(source, 'zh-CN');
  await store.start(source, 'zh-CN');
  translate.mock.calls[0][1]?.onText?.('译');
  expect(store.get(source)).toMatchObject({ content: '译', status: 'running' });
  done.resolve('译文');
  await pending;
  expect(translate).toHaveBeenCalledTimes(1);
  expect(changed).toHaveBeenCalled();
  expect(other).not.toHaveBeenCalled();
  expect(store.get(source)).toMatchObject({ content: '译文', status: 'success', visible: true });
});

test('restores saved translation folded after reconstruction, isolated by Session and source', async () => {
  const { store, api, translate, translation, stored } = setup();
  await store.start(source, 'zh-CN');
  const reopened = new MessageTranslationStore(translation, api, 'session');
  expect(reopened.get(stored())).toMatchObject({ status: 'success', visible: false });
  await reopened.start(stored(), 'zh-CN');
  expect(reopened.get(stored())).toMatchObject({ content: '译文', language: 'zh-CN' });
  reopened.toggle(stored());
  reopened.toggle(stored());
  expect(translate).toHaveBeenCalledTimes(1);
  const changed = messageTranslationSource(message('Changed answer').display)!;
  expect(reopened.get(changed).status).toBe('idle');
  expect(reopened.get(changed).translations).toEqual({});
  await reopened.start(changed, 'zh-CN');
  expect(translate).toHaveBeenCalledTimes(2);

  const otherSession = new MessageTranslationStore(translation, api, 'other');
  await otherSession.start(source, 'zh-CN');
  expect(translate).toHaveBeenCalledTimes(3);
});

test('sharing snapshots only expanded current languages and preserves the captured text', async () => {
  const { store, translate } = setup();
  expect(store.getExpandedTranslations()).toEqual({});
  await store.start(source, 'zh-CN');
  const captured = store.getExpandedTranslations();
  expect(captured).toEqual({
    answer: { sourceHash: source.contentHash, language: 'zh-CN', content: '译文' },
  });
  store.toggle(source);
  expect(store.getExpandedTranslations()).toEqual({});
  translate.mockResolvedValueOnce('Traduction');
  await store.start(source, 'fr-FR');
  expect(store.getExpandedTranslations()).toEqual({
    answer: { sourceHash: source.contentHash, language: 'fr-FR', content: 'Traduction' },
  });
  expect(captured.answer.content).toBe('译文');
  expect(captured.answer.language).toBe('zh-CN');
});

test('sharing captures visible streaming text without waiting for another translation request', async () => {
  const { store, translate } = setup();
  const done = deferred<string>();
  translate.mockImplementationOnce(() => done.promise);
  const pending = store.start(source, 'zh-CN');
  expect(store.getExpandedTranslations()).toEqual({});
  translate.mock.calls[0][1]?.onText?.('部分译文');
  expect(store.getExpandedTranslations().answer.content).toBe('部分译文');
  store.toggle(source);
  expect(store.getExpandedTranslations()).toEqual({});
  done.resolve('完整译文');
  await pending;
  expect(store.getExpandedTranslations()).toEqual({});
  store.toggle(source);
  expect(store.getExpandedTranslations().answer.content).toBe('完整译文');
});

test('reopens and switches among three restored languages without translating again', async () => {
  const { store, api, translate, translation, stored } = setup();
  const translations = {
    'zh-CN': '中文译文',
    'fr-FR': 'Traduction française',
    'ja-JP': '日本語の訳文',
  } as const;
  translate
    .mockResolvedValueOnce(translations['zh-CN'])
    .mockResolvedValueOnce(translations['fr-FR'])
    .mockResolvedValueOnce(translations['ja-JP']);
  await store.start(source, 'zh-CN');
  await store.start(source, 'fr-FR');
  await store.start(source, 'ja-JP');
  const reopened = new MessageTranslationStore(translation, api, 'session');
  expect(reopened.get(stored())).toMatchObject({ translations, language: 'ja-JP', visible: false });
  reopened.toggle(stored());
  expect(reopened.get(stored())).toMatchObject({ content: translations['ja-JP'], visible: true });
  reopened.toggle(stored());
  for (const language of ['fr-FR', 'zh-CN', 'ja-JP'] as const) {
    await reopened.start(stored(), language);
    expect(reopened.get(stored())).toMatchObject({
      content: translations[language],
      visible: true,
      translations,
    });
  }
  expect(translate).toHaveBeenCalledTimes(3);
});

test('restores saved languages when the message arrives without performing a separate read', async () => {
  const { store, translate, save } = setup();
  expect(store.get(source).status).toBe('idle');
  const loaded = {
    ...source,
    translations: {
      sourceHash: source.contentHash,
      results: { 'zh-CN': { content: '已保存', createdAt: 1 } },
    },
  };
  expect(store.get(loaded)).toMatchObject({ content: '已保存', status: 'success', visible: false });
  const snapshot = store.get(loaded);
  expect(store.get(loaded)).toBe(snapshot);
  await store.start(loaded, 'zh-CN');
  expect(translate).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});

test('an older message snapshot cannot replace a completed result in the open Session', async () => {
  const { store } = setup();
  await store.start(source, 'zh-CN');
  const snapshot = store.get(source);
  const older = {
    ...source,
    translations: {
      sourceHash: source.contentHash,
      results: { 'zh-CN': { content: '旧译文', createdAt: 1 } },
    },
  };
  expect(store.get(older)).toBe(snapshot);
  expect(store.get(source).content).toBe('译文');
});

test('switching to a completed language cancels pending output without persisting partial text', async () => {
  const { store, translate, savedResults } = setup();
  await store.start(source, 'zh-CN');
  const done = deferred<string>();
  translate.mockImplementationOnce(() => done.promise);
  const pending = store.start(source, 'fr-FR');
  await Promise.resolve();
  const options = translate.mock.calls[1][1];
  options?.onText?.('partial');
  await store.start(source, 'zh-CN');
  expect(options?.signal?.aborted).toBe(true);
  options?.onText?.('late chunk');
  done.resolve('late result');
  await pending;
  expect(store.get(source)).toMatchObject({
    language: 'zh-CN',
    content: '译文',
    status: 'success',
    translations: { 'zh-CN': '译文' },
  });
  expect(savedResults()).toEqual([expect.objectContaining({ language: 'zh-CN', content: '译文' })]);
  expect(translate).toHaveBeenCalledTimes(2);
});

test('survives row unsubscription and preserves hidden state while streaming completes', async () => {
  const { store, translate } = setup();
  const done = deferred<string>();
  translate.mockImplementationOnce(() => done.promise);
  const unsubscribe = store.subscribe('answer', jest.fn());
  const pending = store.start(source, 'zh-CN');
  unsubscribe();
  store.toggle(source);
  done.resolve('译文');
  await pending;
  expect(store.get(source)).toMatchObject({ content: '译文', status: 'success', visible: false });
  expect(translate.mock.calls[0][1]?.signal?.aborted).toBe(false);
});

test('cancellation rejects late chunks and final results, and retry starts cleanly', async () => {
  const { store, translate, savedResults } = setup();
  const done = deferred<string>();
  translate.mockImplementationOnce(() => done.promise);
  const pending = store.start(source, 'zh-CN');
  await Promise.resolve();
  const options = translate.mock.calls[0][1];
  options?.onText?.('partial');
  store.cancel('answer');
  options?.onText?.('late chunk');
  done.resolve('late result');
  await pending;
  expect(options?.signal?.aborted).toBe(true);
  expect(store.get(source)).toMatchObject({ status: 'cancelled', content: 'partial' });
  expect(savedResults().length).toBe(0);
  await store.start(source, 'zh-CN');
  expect(store.get(source)).toMatchObject({ status: 'success', content: '译文' });
});

test('does not mark a translation saved when the database write fails', async () => {
  const { store, save, savedResults } = setup();
  save.mockRejectedValueOnce(new Error('disk full'));
  await store.start(source, 'zh-CN');
  expect(store.get(source)).toMatchObject({ status: 'error', error: 'failed', translations: {} });
  expect(savedResults().length).toBe(0);
});

test('failed translation is not persisted and exposes only a closed feedback code', async () => {
  const { store, translate, savedResults } = setup();
  translate.mockRejectedValueOnce(new TranslationError('model-unavailable', 'private diagnostic'));
  await store.start(source, 'zh-CN');
  expect(store.get(source)).toMatchObject({ status: 'error', error: 'model-unavailable' });
  expect(savedResults().length).toBe(0);
});

test.each(['changed', 'removed', 'retried', 'partial'] as const)(
  'rejects a late result when the source is %s',
  async (reason) => {
    const { store, translate, savedResults } = setup();
    const done = deferred<string>();
    translate.mockImplementationOnce(() => done.promise);
    const pending = store.start(source, 'zh-CN');
    await Promise.resolve();
    const next = message(reason === 'changed' ? 'Changed answer' : undefined);
    if (reason === 'retried') next.state = 'pending';
    if (reason === 'partial') next.completeness = 'partial';
    store.reconcile(reason === 'removed' ? [] : [next]);
    done.resolve('late');
    await pending;
    expect(translate.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(savedResults().length).toBe(0);
  },
);

test('an older cancelled request cannot overwrite or cancel its replacement', async () => {
  const { store, translate } = setup();
  const old = deferred<string>();
  const replacement = deferred<string>();
  translate
    .mockImplementationOnce(() => old.promise)
    .mockImplementationOnce(() => replacement.promise);
  const pendingOld = store.start(source, 'zh-CN');
  await Promise.resolve();
  store.cancel('answer');
  const pendingNew = store.start(source, 'zh-CN');
  old.resolve('obsolete');
  await pendingOld;
  expect(store.get(source).status).toBe('running');
  replacement.resolve('new');
  await pendingNew;
  expect(store.get(source).content).toBe('new');
});

test('leaving the Session aborts all requests without accepting late results', async () => {
  const { store, translate, savedResults } = setup();
  const done = deferred<string>();
  translate.mockImplementation(() => done.promise);
  const first = store.start(source, 'zh-CN');
  const second = store.start({ ...source, messageId: 'second' }, 'zh-CN');
  await Promise.resolve();
  store.cancelAll();
  expect(translate.mock.calls.every(([, options]) => options?.signal?.aborted)).toBe(true);
  done.resolve('late');
  await Promise.all([first, second]);
  expect(savedResults().length).toBe(0);
});

test('keeps each message target and saved language separate', async () => {
  const { store, translate } = setup();
  translate
    .mockResolvedValueOnce('中文译文')
    .mockResolvedValueOnce('Traduction française')
    .mockResolvedValueOnce('Deutsche Übersetzung');
  await store.start(source, 'zh-CN');
  await store.start(source, 'fr-FR');
  await store.start({ ...source, messageId: 'other' }, 'de-DE');
  expect(store.get(source)).toMatchObject({ language: 'fr-FR', content: 'Traduction française' });
  expect(store.get({ ...source, messageId: 'other' }).language).toBe('de-DE');
  expect(translate.mock.calls.map(([input]) => input.language)).toEqual([
    'zh-CN',
    'fr-FR',
    'de-DE',
  ]);
  await store.start(source, 'zh-CN');
  expect(store.get(source)).toMatchObject({ language: 'zh-CN', content: '中文译文' });
  expect(translate).toHaveBeenCalledTimes(3);
});

test('choosing another language cancels the old request and ignores its late output', async () => {
  const { store, translate, savedResults } = setup();
  const old = deferred<string>();
  const replacement = deferred<string>();
  translate
    .mockImplementationOnce(() => old.promise)
    .mockImplementationOnce(() => replacement.promise);
  const pendingOld = store.start(source, 'zh-CN');
  await Promise.resolve();
  const oldOptions = translate.mock.calls[0][1];
  const pendingNew = store.start(source, 'fr-FR');
  expect(oldOptions?.signal?.aborted).toBe(true);
  oldOptions?.onText?.('late Chinese');
  old.resolve('obsolete');
  await pendingOld;
  expect(store.get(source)).toMatchObject({ language: 'fr-FR', content: '', status: 'running' });
  replacement.resolve('Traduction');
  await pendingNew;
  expect(store.get(source)).toMatchObject({
    language: 'fr-FR',
    content: 'Traduction',
    status: 'success',
  });
  expect(savedResults()).toEqual([
    expect.objectContaining({ language: 'fr-FR', content: 'Traduction' }),
  ]);
});

test('retrying identical source text reuses every language saved on the message', async () => {
  const { store, savedResults, stored, translate } = setup();
  await store.start(source, 'zh-CN');
  await store.start(source, 'fr-FR');
  const savedSource = stored();
  expect(savedResults()).toHaveLength(2);
  store.reconcile([{ ...message(), state: 'pending' }]);
  expect(savedResults()).toHaveLength(2);
  expect(store.get(savedSource).translations).toEqual({ 'zh-CN': '译文', 'fr-FR': '译文' });
  await store.start(savedSource, 'zh-CN');
  expect(translate).toHaveBeenCalledTimes(2);
});
