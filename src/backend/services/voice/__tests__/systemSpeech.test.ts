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

const voice = (identifier: string, name: string, language: string): Speech.Voice => ({
  identifier,
  name,
  language,
  quality: 'Default' as Speech.VoiceQuality,
});

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(setAudioModeAsync).mockResolvedValue(undefined);
  jest.mocked(Speech.stop).mockResolvedValue(undefined);
  jest
    .mocked(Speech.getAvailableVoicesAsync)
    .mockResolvedValue([voice('zh', 'Chinese', 'zh-CN'), voice('en', 'English', 'en-US')]);
  jest.mocked(Speech.speak).mockImplementation((_text, options) => options?.onDone?.());
});

test('deduplicates native voice IDs without discarding different voices with the same name', async () => {
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

test('the default supplies an installed voice for the app locale instead of the device language', async () => {
  jest
    .mocked(Speech.getAvailableVoicesAsync)
    .mockResolvedValue([
      voice('en', 'English', 'en-US'),
      voice('zh-tw', 'Taiwan', 'zh-TW'),
      voice('zh-cn', 'Mandarin', 'zh_CN'),
    ]);
  const engine = createSystemSpeechEngine({ voice: async () => '' });
  await engine.speak({ text: '你好。', language: 'zh-CN', signal: new AbortController().signal });
  expect(Speech.speak).toHaveBeenCalledWith(
    '你好。',
    expect.objectContaining({ language: 'zh-CN', voice: 'zh-cn' }),
  );
});

test('an explicit installed voice is preserved within the app language', async () => {
  jest
    .mocked(Speech.getAvailableVoicesAsync)
    .mockResolvedValue([voice('zh-cn', 'Mandarin', 'zh-CN'), voice('zh-tw', 'Taiwan', 'zh-TW')]);
  const engine = createSystemSpeechEngine({ voice: async () => 'zh-tw' });
  await engine.speak({ text: '你好。', language: 'zh-CN', signal: new AbortController().signal });
  expect(Speech.speak).toHaveBeenCalledWith('你好。', expect.objectContaining({ voice: 'zh-tw' }));
});

test.each(['uninstalled', 'en'])(
  'rejects the unavailable or wrong-language selection %s before native speech starts',
  async (selection) => {
    const engine = createSystemSpeechEngine({ voice: async () => selection });
    await expect(
      engine.speak({ text: '你好。', language: 'zh-CN', signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: 'invalid-voice' });
    expect(Speech.speak).not.toHaveBeenCalled();
    expect(setAudioModeAsync).not.toHaveBeenCalled();
  },
);

test('fails when the app language has no installed voice instead of speaking another language', async () => {
  const engine = createSystemSpeechEngine({ voice: async () => '' });
  await expect(
    engine.speak({ text: 'Bonjour.', language: 'fr-FR', signal: new AbortController().signal }),
  ).rejects.toMatchObject({ code: 'unsupported' });
  expect(Speech.speak).not.toHaveBeenCalled();
});

test('cancellation settles after native stop even if the utterance never emits onStopped', async () => {
  const started = deferred<void>();
  const stopped = deferred<void>();
  const controller = new AbortController();
  jest.mocked(Speech.speak).mockImplementationOnce(() => started.resolve());
  jest.mocked(Speech.stop).mockReturnValueOnce(stopped.promise);
  const engine = createSystemSpeechEngine({ voice: async () => '' });
  const speaking = engine.speak({ text: 'Hello.', language: 'en-US', signal: controller.signal });
  let finished = false;
  void speaking.then(
    () => {
      finished = true;
    },
    () => {
      finished = true;
    },
  );
  await started.promise;
  controller.abort();
  await Promise.resolve();
  expect(Speech.stop).toHaveBeenCalledTimes(1);
  expect(finished).toBe(false);

  stopped.resolve();
  await expect(speaking).rejects.toBe(controller.signal.reason);
  expect(finished).toBe(true);
});

test('cancellation while loading voices cannot start playback when enumeration completes', async () => {
  const voices = deferred<Speech.Voice[]>();
  jest.mocked(Speech.getAvailableVoicesAsync).mockReturnValueOnce(voices.promise);
  const controller = new AbortController();
  const engine = createSystemSpeechEngine({ voice: async () => '' });
  const speaking = engine.speak({ text: 'Hello.', language: 'en-US', signal: controller.signal });
  controller.abort();
  voices.resolve([voice('en', 'English', 'en-US')]);
  await expect(speaking).rejects.toBe(controller.signal.reason);
  expect(setAudioModeAsync).not.toHaveBeenCalled();
  expect(Speech.speak).not.toHaveBeenCalled();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
