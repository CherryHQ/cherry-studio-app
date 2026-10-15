import type { ConversationMessage } from '@/frontend/appShell/conversation';
import { CacheService, createInMemoryKvStorage } from '@/frontend/data/CacheService';
import {
  TranslationError,
  type TranslationInput,
  type TranslationOptions,
} from '@/shared/contracts/translation';

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
function setup() {
  const storage = createInMemoryKvStorage();
  const cache = new CacheService(storage);
  const translate = jest.fn(
    async (_input: TranslationInput, _options?: TranslationOptions) => '译文',
  );
  const translation = { translate };
  const store = new MessageTranslationStore(translation, cache, 'local', 'session');
  return { storage, cache, translate, translation, store };
}

test('does not request translation until invoked, deduplicates clicks and notifies only its row', async () => {
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

test('restores only the chosen language after reconstruction, isolated by source, Session and content', async () => {
  const { store, storage, translate, translation } = setup();
  await store.start(source, 'zh-CN');
  const cache = new CacheService(storage);
  const reopened = new MessageTranslationStore(translation, cache, 'local', 'session');
  expect(reopened.get(source).status).toBe('idle');
  await reopened.start(source, 'zh-CN');
  expect(reopened.get(source)).toMatchObject({ content: '译文', language: 'zh-CN' });
  reopened.toggle(source);
  reopened.toggle(source);
  expect(translate).toHaveBeenCalledTimes(1);
  expect(reopened.get({ ...source, contentHash: 'changed' }).status).toBe('idle');
  await reopened.start({ ...source, contentHash: 'changed' }, 'zh-CN');
  expect(translate).toHaveBeenCalledTimes(2);

  const desktop = new MessageTranslationStore(translation, cache, 'desktop', 'session');
  await desktop.start(source, 'zh-CN');
  const otherSession = new MessageTranslationStore(translation, cache, 'local', 'other');
  await otherSession.start(source, 'zh-CN');
  expect(translate).toHaveBeenCalledTimes(4);
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

test('cancellation discards late chunks and final results, and retry starts cleanly', async () => {
  const { store, translate, cache } = setup();
  const done = deferred<string>();
  translate.mockImplementationOnce(() => done.promise);
  const pending = store.start(source, 'zh-CN');
  const options = translate.mock.calls[0][1];
  options?.onText?.('partial');
  store.cancel('answer');
  options?.onText?.('late chunk');
  done.resolve('late result');
  await pending;
  expect(options?.signal?.aborted).toBe(true);
  expect(store.get(source)).toMatchObject({ status: 'cancelled', content: 'partial' });
  expect(cache.getPersist('chat.translations')).toEqual({});
  await store.start(source, 'zh-CN');
  expect(store.get(source)).toMatchObject({ status: 'success', content: '译文' });
});

test('failed results are not persisted, and failure keeps a closed feedback code', async () => {
  const { store, translate, cache } = setup();
  translate.mockRejectedValueOnce(new TranslationError('model-unavailable', 'private diagnostic'));
  await store.start(source, 'zh-CN');
  expect(store.get(source)).toMatchObject({ status: 'error', error: 'model-unavailable' });
  expect(cache.getPersist('chat.translations')).toEqual({});
});

test.each(['changed', 'removed', 'retried', 'partial'] as const)(
  'rejects a late result when the source is %s',
  async (reason) => {
    const { store, translate, cache } = setup();
    const done = deferred<string>();
    translate.mockImplementationOnce(() => done.promise);
    const pending = store.start(source, 'zh-CN');
    const next = message(reason === 'changed' ? 'Changed answer' : undefined);
    if (reason === 'retried') next.state = 'pending';
    if (reason === 'partial') next.completeness = 'partial';
    store.reconcile(reason === 'removed' ? [] : [next]);
    done.resolve('late');
    await pending;
    expect(translate.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(cache.getPersist('chat.translations')).toEqual({});
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
  const { store, translate, cache } = setup();
  const done = deferred<string>();
  translate.mockImplementation(() => done.promise);
  const first = store.start(source, 'zh-CN');
  const second = store.start({ ...source, messageId: 'second' }, 'zh-CN');
  store.cancelAll();
  expect(translate.mock.calls.every(([, options]) => options?.signal?.aborted)).toBe(true);
  done.resolve('late');
  await Promise.all([first, second]);
  expect(cache.getPersist('chat.translations')).toEqual({});
});

test('keeps each message target and cached language separate', async () => {
  const { store, translate } = setup();
  translate
    .mockResolvedValueOnce('中文译文')
    .mockResolvedValueOnce('Traduction française')
    .mockResolvedValueOnce('Deutsche Übersetzung');
  await store.start(source, 'zh-CN');
  await store.start(source, 'fr-FR');
  await store.start({ ...source, messageId: 'other' }, 'de-DE');
  expect(store.get(source)).toMatchObject({
    language: 'fr-FR',
    content: 'Traduction française',
  });
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
  const { store, translate, cache } = setup();
  const old = deferred<string>();
  const replacement = deferred<string>();
  translate
    .mockImplementationOnce(() => old.promise)
    .mockImplementationOnce(() => replacement.promise);
  const pendingOld = store.start(source, 'zh-CN');
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
  expect(Object.values(cache.getPersist('chat.translations'))).toEqual([
    { contentHash: source.contentHash, content: 'Traduction' },
  ]);
});

test('retrying an answer invalidates all translated languages even if the regenerated words match', async () => {
  const { store, cache } = setup();
  await store.start(source, 'zh-CN');
  await store.start(source, 'fr-FR');
  expect(Object.keys(cache.getPersist('chat.translations'))).toHaveLength(2);
  store.reconcile([{ ...message(), state: 'pending' }]);
  expect(cache.getPersist('chat.translations')).toEqual({});
  expect(store.get(source).status).toBe('idle');
});
