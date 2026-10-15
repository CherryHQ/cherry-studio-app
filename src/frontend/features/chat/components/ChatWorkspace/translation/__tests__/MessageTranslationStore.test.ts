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
  const store = new MessageTranslationStore(translation, cache, 'local', 'session', 'zh-CN');
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
  expect(translate).not.toHaveBeenCalled();
  const pending = store.start(source);
  await store.start(source);
  translate.mock.calls[0][1]?.onText?.('译');
  expect(store.get(source)).toMatchObject({ content: '译', status: 'running' });
  done.resolve('译文');
  await pending;
  expect(translate).toHaveBeenCalledTimes(1);
  expect(changed).toHaveBeenCalled();
  expect(other).not.toHaveBeenCalled();
  expect(store.get(source)).toMatchObject({ content: '译文', status: 'success', visible: true });
});

test('restores saved text after storage reconstruction, isolated by source, Session, language and content', async () => {
  const { store, storage, translate, translation } = setup();
  await store.start(source);
  const cache = new CacheService(storage);
  const reopened = new MessageTranslationStore(translation, cache, 'local', 'session', 'zh-CN');
  expect(reopened.get(source).content).toBe('译文');
  reopened.toggle(source);
  reopened.toggle(source);
  expect(translate).toHaveBeenCalledTimes(1);
  expect(reopened.get({ ...source, contentHash: 'changed' }).status).toBe('idle');
  expect(
    new MessageTranslationStore(translation, cache, 'desktop', 'session', 'zh-CN').get(source)
      .status,
  ).toBe('idle');
  expect(
    new MessageTranslationStore(translation, cache, 'local', 'other', 'zh-CN').get(source).status,
  ).toBe('idle');
  expect(
    new MessageTranslationStore(translation, cache, 'local', 'session', 'fr-FR').get(source).status,
  ).toBe('idle');
});

test('survives row unsubscription and preserves hidden state while streaming completes', async () => {
  const { store, translate } = setup();
  const done = deferred<string>();
  translate.mockImplementationOnce(() => done.promise);
  const unsubscribe = store.subscribe('answer', jest.fn());
  const pending = store.start(source);
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
  const pending = store.start(source);
  const options = translate.mock.calls[0][1];
  options?.onText?.('partial');
  store.cancel('answer');
  options?.onText?.('late chunk');
  done.resolve('late result');
  await pending;
  expect(options?.signal?.aborted).toBe(true);
  expect(store.get(source)).toMatchObject({ status: 'cancelled', content: 'partial' });
  expect(cache.getPersist('chat.translations')).toEqual({});
  await store.start(source);
  expect(store.get(source)).toMatchObject({ status: 'success', content: '译文' });
});

test('failed results are not persisted, and failure keeps a closed feedback code', async () => {
  const { store, translate, cache } = setup();
  translate.mockRejectedValueOnce(new TranslationError('model-unavailable', 'private diagnostic'));
  await store.start(source);
  expect(store.get(source)).toMatchObject({ status: 'error', error: 'model-unavailable' });
  expect(cache.getPersist('chat.translations')).toEqual({});
});

test.each(['changed', 'removed', 'retried', 'partial'] as const)(
  'rejects a late result when the source is %s',
  async (reason) => {
    const { store, translate, cache } = setup();
    const done = deferred<string>();
    translate.mockImplementationOnce(() => done.promise);
    const pending = store.start(source);
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

test('invalidates a completed translation on answer retry even if the regenerated words match', async () => {
  const { store, cache } = setup();
  await store.start(source);
  store.reconcile([{ ...message(), state: 'pending' }]);
  expect(cache.getPersist('chat.translations')).toEqual({});
  expect(store.get(source).status).toBe('idle');
});

test('an older cancelled request cannot overwrite or cancel its replacement', async () => {
  const { store, translate } = setup();
  const old = deferred<string>();
  const replacement = deferred<string>();
  translate
    .mockImplementationOnce(() => old.promise)
    .mockImplementationOnce(() => replacement.promise);
  const pendingOld = store.start(source);
  store.cancel('answer');
  const pendingNew = store.start(source);
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
  const first = store.start(source);
  const second = store.start({ ...source, messageId: 'second' });
  store.cancelAll();
  expect(translate.mock.calls.every(([, options]) => options?.signal?.aborted)).toBe(true);
  done.resolve('late');
  await Promise.all([first, second]);
  expect(cache.getPersist('chat.translations')).toEqual({});
});
