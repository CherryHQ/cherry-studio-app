import { setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';

import { createSystemSpeechEngine } from '../systemSpeech';

const mockBeginUse = jest.fn();
const mockEndUse = jest.fn();
jest.mock('../../../../../modules/system-integration', () => ({
  getSystemIntegration: () => ({
    beginBackgroundAudioUse: mockBeginUse,
    endBackgroundAudioUse: mockEndUse,
  }),
}));

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
  mockBeginUse.mockResolvedValue(undefined);
  mockEndUse.mockResolvedValue(undefined);
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
  expect(mockBeginUse).toHaveBeenCalledWith(expect.any(String), 'speech');
  expect(mockEndUse).toHaveBeenCalledWith(mockBeginUse.mock.calls[0][0]);
});

test.each([{ firstEmitsStart: true }, { firstEmitsStart: false }])(
  'reports one native start when firstEmitsStart is $firstEmitsStart',
  async ({ firstEmitsStart }) => {
    const first = deferred<Speech.SpeechOptions>();
    const second = deferred<Speech.SpeechOptions>();
    const onPhase = jest.fn();
    jest.mocked(Speech.speak).mockImplementationOnce((_text, options) => first.resolve(options!));
    jest.mocked(Speech.speak).mockImplementationOnce((_text, options) => second.resolve(options!));
    const engine = createSystemSpeechEngine({ voice: async () => '' });
    const speaking = engine.speak({
      text: 'x'.repeat(221),
      language: 'en-US',
      signal: new AbortController().signal,
      playback: { onPhase, onProgress: jest.fn(), onControls: jest.fn() },
    });
    const firstOptions = await first.promise;
    expect(onPhase).not.toHaveBeenCalled();
    if (firstEmitsStart) {
      firstOptions.onStart?.();
      firstOptions.onStart?.();
      expect(onPhase).toHaveBeenCalledTimes(1);
      expect(onPhase).toHaveBeenCalledWith('playing');
    }
    firstOptions.onDone?.();
    const secondOptions = await second.promise;
    expect(onPhase).toHaveBeenCalledTimes(1);
    expect(onPhase).toHaveBeenCalledWith('playing');
    secondOptions.onStart?.();
    secondOptions.onDone?.();
    await speaking;
    expect(Speech.speak).toHaveBeenCalledTimes(2);
    expect(onPhase).toHaveBeenCalledTimes(1);
  },
);

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
  expect(mockEndUse).not.toHaveBeenCalled();

  stopped.resolve();
  await expect(speaking).rejects.toBe(controller.signal.reason);
  expect(finished).toBe(true);
  expect(mockEndUse).toHaveBeenCalledTimes(1);
});

test('failed audio configuration releases the voice session without starting speech', async () => {
  jest.mocked(setAudioModeAsync).mockRejectedValueOnce(new Error('Audio unavailable'));
  const engine = createSystemSpeechEngine({ voice: async () => '' });
  await expect(
    engine.speak({ text: 'Hello.', language: 'en-US', signal: new AbortController().signal }),
  ).rejects.toThrow('Audio unavailable');
  expect(Speech.speak).not.toHaveBeenCalled();
  expect(mockEndUse).toHaveBeenCalledTimes(1);
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

test('pauses active utterance cleanly and resumes without replaying already-completed chunks', async () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const utterances: { text: string; options?: Speech.SpeechOptions }[] = [];
  jest.mocked(Speech.speak).mockImplementation((text, options) => {
    utterances.push({ text, options });
  });
  jest.mocked(Speech.stop).mockImplementation(async () => {
    const current = utterances.at(-1);
    current?.options?.onStopped?.();
  });

  const controller = new AbortController();
  const phases: string[] = [];
  const progresses: { completedChunks: number; totalChunks: number }[] = [];
  const controlsHolder: { current: { pause(): void; resume(): string | void } | null } = {
    current: null,
  };
  const engine = createSystemSpeechEngine({ voice: async () => '' });

  // Build text that splits across at least two chunks (> 220 chars).
  const firstSentence = `${'A'.repeat(180)}.`;
  const secondSentence = `${'B'.repeat(180)}.`;
  const speaking = engine.speak({
    text: `${firstSentence} ${secondSentence}`,
    language: 'en-US',
    signal: controller.signal,
    playback: {
      onPhase: (phase) => phases.push(phase),
      onProgress: (progress) => progresses.push(progress),
      onControls: (next) => {
        controlsHolder.current = next;
      },
    },
  });

  await flush();
  expect(utterances).toHaveLength(1);
  expect(progresses).toEqual([{ completedChunks: 0, totalChunks: 2 }]);
  utterances[0]!.options?.onStart?.();
  expect(phases).toEqual(['playing']);
  const controls = controlsHolder.current;
  expect(controls).not.toBeNull();
  if (!controls) throw new Error('Expected controls to be registered');

  controls.pause();
  await flush();
  expect(phases.at(-1)).toBe('paused');
  expect(utterances).toHaveLength(1);

  expect(controls.resume()).toBe('preparing');
  expect(phases.at(-1)).toBe('preparing');
  await flush();
  expect(utterances).toHaveLength(2);
  expect(utterances[1]!.text).toBe(firstSentence);
  expect(phases.at(-1)).toBe('preparing');
  utterances[1]!.options?.onStart?.();
  expect(phases.at(-1)).toBe('playing');

  // If Speech.stop() settles before a trailing onDone arrives, chunk 0 still advances without replay.
  jest.mocked(Speech.stop).mockResolvedValueOnce(undefined);
  controls.pause();
  await Promise.resolve();
  await Promise.resolve();
  utterances[1]!.options?.onDone?.();
  await flush();
  expect(utterances).toHaveLength(2);
  expect(progresses.at(-1)).toEqual({ completedChunks: 1, totalChunks: 2 });

  expect(controls.resume()).toBe('preparing');
  await flush();
  expect(utterances).toHaveLength(3);
  expect(utterances[2]!.text).toBe(secondSentence);
  utterances[2]!.options?.onStart?.();
  expect(phases.at(-1)).toBe('playing');

  // If neither onDone nor onStopped fires after Speech.stop(), fallback timer pauses cleanly.
  jest.mocked(Speech.stop).mockResolvedValueOnce(undefined);
  controls.pause();
  await new Promise((resolve) => setTimeout(resolve, 75));
  controller.abort(new Error('Stopped'));
  await expect(speaking).rejects.toThrow('Stopped');
  expect(controlsHolder.current).toBeNull();
});

test('unexpected native onStopped delegates to onInterrupted without aborting when wired', async () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const utterances: { text: string; options?: Speech.SpeechOptions }[] = [];
  jest.mocked(Speech.speak).mockImplementation((text, options) => {
    utterances.push({ text, options });
  });

  const controlsHolder: { current: { pause(): void; resume(): string | void } | null } = {
    current: null,
  };
  const onInterrupted = jest.fn(() => controlsHolder.current?.pause());
  const engine = createSystemSpeechEngine({ voice: async () => '' });
  const speaking = engine.speak({
    text: 'Hello.',
    language: 'en-US',
    signal: new AbortController().signal,
    playback: {
      onPhase: jest.fn(),
      onProgress: jest.fn(),
      onControls: (next) => {
        controlsHolder.current = next;
      },
      onInterrupted,
    },
  });

  await flush();
  expect(utterances).toHaveLength(1);
  utterances[0]!.options?.onStopped?.();
  await flush();
  expect(onInterrupted).toHaveBeenCalledTimes(1);
  expect(utterances).toHaveLength(1);

  controlsHolder.current?.resume();
  await flush();
  expect(utterances).toHaveLength(2);
  utterances[1]!.options?.onDone?.();
  await expect(speaking).resolves.toBeUndefined();
});

test('advances paused chunk when onDone arrives after the 50ms fallback timer without replaying or finishing prematurely', async () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const utterances: { text: string; options?: Speech.SpeechOptions }[] = [];
  jest.mocked(Speech.speak).mockImplementation((text, options) => {
    utterances.push({ text, options });
  });
  jest.mocked(Speech.stop).mockResolvedValue(undefined);

  const progresses: { completedChunks: number; totalChunks: number }[] = [];
  const controlsHolder: { current: { pause(): void; resume(): string | void } | null } = {
    current: null,
  };
  const firstSentence = `${'A'.repeat(180)}.`;
  const secondSentence = `${'B'.repeat(180)}.`;
  const engine = createSystemSpeechEngine({ voice: async () => '' });
  const speaking = engine.speak({
    text: `${firstSentence} ${secondSentence}`,
    language: 'en-US',
    signal: new AbortController().signal,
    playback: {
      onPhase: jest.fn(),
      onProgress: (progress) => progresses.push(progress),
      onControls: (next) => {
        controlsHolder.current = next;
      },
    },
  });

  await flush();
  expect(utterances).toHaveLength(1);
  controlsHolder.current!.pause();
  // Let the 50ms fallback timer settle pause first, then deliver a very late onDone.
  await new Promise((resolve) => setTimeout(resolve, 70));
  utterances[0]!.options?.onDone?.();
  expect(progresses.at(-1)).toEqual({ completedChunks: 1, totalChunks: 2 });

  controlsHolder.current!.resume();
  await flush();
  expect(utterances).toHaveLength(2);
  expect(utterances[1]!.text).toBe(secondSentence);

  // On the final chunk, late onDone past 50ms completes and tears down reading immediately without needing manual resume.
  controlsHolder.current!.pause();
  await new Promise((resolve) => setTimeout(resolve, 70));
  utterances[1]!.options?.onDone?.();
  expect(progresses.at(-1)).toEqual({ completedChunks: 2, totalChunks: 2 });
  await expect(speaking).resolves.toBeUndefined();
  expect(utterances).toHaveLength(2);
  expect(controlsHolder.current).toBeNull();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
