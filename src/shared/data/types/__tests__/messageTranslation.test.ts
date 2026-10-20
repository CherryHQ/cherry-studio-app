import { SaveAgentMessageTranslationSchema } from '@/shared/data/api/schemas/agentSessionMessages';

import { MessageTranslationsSchema, readMessageTranslations } from '../messageTranslation';

const translations = {
  sourceHash: 'a'.repeat(64),
  results: {
    'zh-CN': { content: '中文译文', createdAt: 1 },
    'ja-JP': { content: '日本語の訳文', createdAt: 2 },
  },
};

test('round-trips independent languages beside message parts', () => {
  expect(MessageTranslationsSchema.parse(JSON.parse(JSON.stringify(translations)))).toEqual(
    translations,
  );
  expect(readMessageTranslations(undefined)).toBeUndefined();
});

test.each([
  { sourceHash: 'invalid', results: {} },
  { ...translations, results: { unknown: { content: 'Text', createdAt: 1 } } },
  { ...translations, results: { 'zh-CN': { content: '', createdAt: 1 } } },
  { ...translations, results: { 'zh-CN': { content: '  \n ', createdAt: 1 } } },
  { ...translations, results: { 'zh-CN': { content: 'Text', createdAt: -1 } } },
])('isolates unreadable translation metadata from the original message: %j', (value) => {
  expect(MessageTranslationsSchema.safeParse(value).success).toBe(false);
  expect(readMessageTranslations(value)).toBeUndefined();
});

test.each([
  { content: '' },
  { language: 'invalid' },
  { sourceHash: 'invalid' },
  { content: ' \n ' },
])('rejects invalid translation writes: %j', (invalid) => {
  expect(
    SaveAgentMessageTranslationSchema.safeParse({
      sourceHash: translations.sourceHash,
      language: 'zh-CN',
      content: '译文',
      ...invalid,
    }).success,
  ).toBe(false);
});
