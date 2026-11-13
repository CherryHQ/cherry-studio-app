import { CacheService, createInMemoryKvStorage } from '@/frontend/data/CacheService';

import { remoteMessageTranslationPersistence } from '../messageTranslationPersistence';
import { messageTranslationSource } from '../messageTranslationSource';
import { MessageTranslationStore } from '../MessageTranslationStore';

const source = {
  messageId: 'same-message',
  revision: '1',
  contentHash: 'a'.repeat(64),
  text: 'Original',
};

test('remote reading aids survive reconstruction and isolate desktop, session, revision, text and language', async () => {
  const storage = createInMemoryKvStorage();
  const cache = new CacheService(storage);
  const own = remoteMessageTranslationPersistence('desktop-a/session-a', cache);
  await own.save(source, 'zh-CN', '中文');
  await own.save(source, 'fr-FR', 'Français');
  const reopened = remoteMessageTranslationPersistence(
    'desktop-a/session-a',
    new CacheService(storage),
  );
  expect(reopened.read?.(source)?.results).toMatchObject({
    'zh-CN': { content: '中文' },
    'fr-FR': { content: 'Français' },
  });
  expect(
    remoteMessageTranslationPersistence('desktop-b/session-a', cache).read?.(source),
  ).toBeUndefined();
  expect(
    remoteMessageTranslationPersistence('desktop-a/session-b', cache).read?.(source),
  ).toBeUndefined();
  expect(own.read?.({ ...source, revision: '2' })).toBeUndefined();
  expect(own.read?.({ ...source, contentHash: 'b'.repeat(64) })).toBeUndefined();
});

test('remote translations use the same run state and restore folded without an Agent message API', async () => {
  const cache = new CacheService(createInMemoryKvStorage());
  const translate = jest.fn(async () => '中文');
  const persistence = remoteMessageTranslationPersistence('desktop/session', cache);
  const store = new MessageTranslationStore({ translate }, persistence);
  await store.start(source, 'zh-CN');
  expect(store.getExpandedTranslations()['same-message']).toMatchObject({
    content: '中文',
    revision: '1',
  });
  const reopened = new MessageTranslationStore(
    { translate },
    remoteMessageTranslationPersistence('desktop/session', cache),
  );
  expect(reopened.get(source)).toMatchObject({ visible: false, status: 'success' });
  await reopened.start(source, 'zh-CN');
  expect(translate).toHaveBeenCalledTimes(1);
  expect(reopened.get({ ...source, revision: '2' }).status).toBe('idle');
});

test('phone-owned translation cache bounds retained data and ignores corrupted entries', async () => {
  const storage = createInMemoryKvStorage();
  storage.set('remote_agent.translations', JSON.stringify({ bad: { sourceHash: 'corrupt' } }));
  const cache = new CacheService(storage);
  const persistence = remoteMessageTranslationPersistence('desktop/session', cache);
  for (let index = 0; index < 205; index++)
    await persistence.save({ ...source, messageId: String(index) }, 'zh-CN', '译文');
  expect(cache.getPersist('remote_agent.translations').bad).toBeUndefined();
  expect(Object.keys(cache.getPersist('remote_agent.translations')).length).toBeLessThanOrEqual(
    200,
  );
  await persistence.save(source, 'zh-CN', 'x'.repeat(2_000_001));
  expect(JSON.stringify(cache.getPersist('remote_agent.translations')).length).toBeLessThan(
    2_020_000,
  );
});

test('late citation metadata does not change the translation source hash', () => {
  const message = {
    id: 'reply',
    revision: '1',
    role: 'assistant' as const,
    status: 'success' as const,
    data: { parts: [{ type: 'text' as const, text: 'Answer [cite:source]' }] },
  };
  const original = messageTranslationSource(message)!;
  const resolved = messageTranslationSource({
    ...message,
    data: {
      ...message.data,
      citationSources: [{ id: 'source', title: 'Source', url: 'https://example.com' }],
    },
  })!;
  expect(resolved.contentHash).toBe(original.contentHash);
});
