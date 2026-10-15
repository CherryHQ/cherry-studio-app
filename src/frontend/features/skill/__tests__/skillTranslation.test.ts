import { CacheService } from '@/frontend/data/CacheService';

import { skillTranslationQueryOptions } from '../skillTranslation';

jest.mock('@/frontend/data/CacheService', () => {
  const actual = jest.requireActual('@/frontend/data/CacheService');
  const storage = actual.createInMemoryKvStorage();
  return { ...actual, cacheService: new actual.CacheService(storage), testStorage: storage };
});

const input = { contentHash: 'revision-a', language: 'zh-CN' as const, text: '# Read me' };
const translated = '# 使用说明\n\n保留 `code`。';

beforeEach(() => {
  jest
    .requireMock('@/frontend/data/CacheService')
    .cacheService.deletePersist('skills.translations');
});

test('restores a saved document after cache reconstruction without translating again', async () => {
  const skills = { translate: jest.fn().mockResolvedValue(translated) };
  const context = { signal: new AbortController().signal };
  await skillTranslationQueryOptions(skills, input).queryFn(context);

  const cache = jest.requireMock('@/frontend/data/CacheService');
  cache.cacheService = new CacheService(cache.testStorage);
  const reopened = skillTranslationQueryOptions(skills, input);
  expect(reopened.initialData()).toBe(translated);
  expect(await reopened.queryFn(context)).toBe(translated);
  expect(skills.translate).toHaveBeenCalledTimes(1);
});

test('keeps translations separate for different content and languages', async () => {
  const skills = { translate: jest.fn().mockResolvedValue(translated) };
  const context = { signal: new AbortController().signal };
  await skillTranslationQueryOptions(skills, input).queryFn(context);

  const updated = skillTranslationQueryOptions(skills, { ...input, contentHash: 'revision-b' });
  const french = skillTranslationQueryOptions(skills, { ...input, language: 'fr-FR' });
  expect(updated.initialData()).toBeUndefined();
  expect(french.initialData()).toBeUndefined();
  skills.translate.mockResolvedValueOnce('# Lisez-moi');
  await french.queryFn(context);
  expect(skills.translate).toHaveBeenLastCalledWith(
    { text: input.text, language: 'fr-FR' },
    context,
  );
  expect(french.initialData()).toBe('# Lisez-moi');
  expect(skillTranslationQueryOptions(skills, input).initialData()).toBe(translated);
});

test('failed translations do not leave a saved document', async () => {
  const skills = { translate: jest.fn().mockRejectedValue(new Error('offline')) };
  const options = skillTranslationQueryOptions(skills, input);
  await expect(options.queryFn({ signal: new AbortController().signal })).rejects.toThrow(
    'offline',
  );
  expect(options.initialData()).toBeUndefined();
});
