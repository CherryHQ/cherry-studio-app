import * as Speech from 'expo-speech';

import { createSystemSpeechEngine } from '../systemSpeech';

jest.mock('expo-speech', () => ({ getAvailableVoicesAsync: jest.fn() }));

test('deduplicates native voice IDs without discarding different voices with the same name', async () => {
  const voice = (identifier: string, name: string, language: string): Speech.Voice => ({
    identifier,
    name,
    language,
    quality: 'Default' as Speech.VoiceQuality,
  });
  jest
    .mocked(Speech.getAvailableVoicesAsync)
    .mockResolvedValue([
      voice('zh', 'zh', 'zh-CN'),
      voice('zh', 'zh', 'zh-CN'),
      voice('zh', 'zh', 'zh-TW'),
      voice('mandarin-a', 'Mandarin', 'zh-CN'),
      voice('mandarin-b', 'Mandarin', 'zh-TW'),
      voice('en', 'English', 'en-US'),
    ]);
  const engine = createSystemSpeechEngine({ voice: async () => '' });
  await expect(engine.listVoices('zh-CN', new AbortController().signal)).resolves.toEqual([
    { id: 'zh', name: 'zh', language: 'zh-CN' },
    { id: 'mandarin-a', name: 'Mandarin', language: 'zh-CN' },
    { id: 'mandarin-b', name: 'Mandarin', language: 'zh-TW' },
  ]);
});
