import { setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';

import { createSystemSpeechEngine } from '../systemSpeech';

jest.mock('expo-audio', () => ({ setAudioModeAsync: jest.fn(async () => undefined) }));
jest.mock('expo-speech', () => ({
  getAvailableVoicesAsync: jest.fn(),
  maxSpeechInputLength: 4000,
  speak: jest.fn(),
  stop: jest.fn(),
}));

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

test('reads in the playback session so the ring switch does not silence it', async () => {
  const order: string[] = [];
  jest.mocked(setAudioModeAsync).mockImplementationOnce(async (mode) => {
    order.push(`session:${String(mode.playsInSilentMode)}`);
  });
  jest.mocked(Speech.speak).mockImplementationOnce((_text, options) => {
    order.push('speak');
    options?.onDone?.();
  });
  const engine = createSystemSpeechEngine({ voice: async () => '' });
  await engine.speak({ text: 'Hello.', language: 'en-US', signal: new AbortController().signal });
  expect(order).toEqual(['session:true', 'speak']);
});
