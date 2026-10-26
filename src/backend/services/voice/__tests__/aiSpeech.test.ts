import { type AudioStatus, createAudioPlayer, setAudioModeAsync } from 'expo-audio';

import { VoiceError } from '@/shared/contracts/voice';

import { createAiSpeechEngine, type AiSpeechDependencies } from '../aiSpeech';
import { deleteFile } from '../voiceStorage';

jest.mock('expo-audio', () => ({ createAudioPlayer: jest.fn(), setAudioModeAsync: jest.fn() }));
jest.mock('../voiceStorage', () => ({ deleteFile: jest.fn() }));

function fixture() {
  let status!: (value: Partial<AudioStatus>) => void;
  const player = {
    addListener: jest.fn((_event: string, listener: typeof status) => {
      status = listener;
      return { remove: jest.fn() };
    }),
    play: jest.fn(),
    pause: jest.fn(),
    release: jest.fn(),
  };
  jest
    .mocked(createAudioPlayer)
    .mockReturnValue(player as unknown as ReturnType<typeof createAudioPlayer>);
  jest.mocked(setAudioModeAsync).mockResolvedValue(undefined);
  const dependencies = {
    ai: {
      generateSpeech: jest.fn(
        async (
          _input: Parameters<AiSpeechDependencies['ai']['generateSpeech']>[0],
          _signal?: AbortSignal,
        ) => ({
          audio: new Uint8Array([1, 2, 3]),
          mediaType: 'audio/wav',
        }),
      ),
      getVoiceModelStatus: jest.fn(async () => 'ready' as const),
      getSpeechModelOptions: jest.fn(async () => ({
        voices: [{ id: 'alloy', name: 'alloy' }],
        defaultVoice: 'alloy',
        acceptsCustomVoice: false,
      })),
      resolveSpeechConfiguration: jest.fn(async () => ({
        voice: 'alloy',
        maxInputCharacters: 4096,
        mediaType: 'audio/wav',
      })),
    },
    preference: {
      getMultipleRaw: jest.fn(async () => ({
        'feature.voice.speech_model': { providerId: 'aihubmix', modelId: 'tts-1' },
        'feature.voice.ai_voice': '',
      })),
    },
    scratch: {
      writeAudio: jest.fn().mockReturnValue({ uri: 'file:///voice.wav' }),
      dispose: jest.fn(),
    },
  } satisfies AiSpeechDependencies;
  const engine = createAiSpeechEngine(dependencies);
  const controller = new AbortController();
  return {
    ...dependencies,
    player,
    controller,
    finish: () => status({ didJustFinish: true }),
    speak: (text = 'Hello.') =>
      engine.speak({ text, language: 'en-US', signal: controller.signal }),
  };
}

beforeEach(() => jest.clearAllMocks());

test('does not start playback after cancellation during audio-mode preparation', async () => {
  const f = fixture();
  let ready!: () => void;
  const preparing = new Promise<void>((resolve) => {
    ready = resolve;
  });
  let finishMode!: () => void;
  jest.mocked(setAudioModeAsync).mockImplementationOnce(() => {
    ready();
    return new Promise<void>((resolve) => {
      finishMode = resolve;
    });
  });
  const pending = f.speak();
  await preparing;
  const reason = new Error('stop reading');
  f.controller.abort(reason);
  finishMode();
  await expect(pending).rejects.toBe(reason);
  expect(createAudioPlayer).not.toHaveBeenCalled();
  expect(deleteFile).toHaveBeenCalledWith('file:///voice.wav');
});

test('observes a prefetch failure while playback continues, then reports it and cleans up', async () => {
  const f = fixture();
  const failure = new Error('next audio failed');
  f.ai.generateSpeech
    .mockResolvedValueOnce({ audio: new Uint8Array([1]), mediaType: 'audio/wav' })
    .mockRejectedValueOnce(failure);
  let started!: () => void;
  const playing = new Promise<void>((resolve) => {
    started = resolve;
  });
  f.player.play.mockImplementationOnce(started);
  const pending = f.speak(`${'a'.repeat(4095)}. Next part.`);
  await playing;
  // Give the rejected prefetch an event-loop turn while the first part remains in playback.
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(f.ai.generateSpeech).toHaveBeenCalledTimes(2);
  f.finish();
  await expect(pending).rejects.toBe(failure);
  expect(createAudioPlayer).toHaveBeenCalledTimes(1);
  expect(f.player.release).toHaveBeenCalledTimes(1);
  expect(deleteFile).toHaveBeenCalledWith('file:///voice.wav');
});

test('a failed part cancels the request generating the next one', async () => {
  const f = fixture();
  let nextRequest: AbortSignal | undefined;
  f.ai.generateSpeech
    .mockResolvedValueOnce({ audio: new Uint8Array([1]), mediaType: 'audio/wav' })
    .mockImplementationOnce((_input, signal) => {
      nextRequest = signal;
      return new Promise(() => undefined);
    });
  f.player.play.mockImplementationOnce(() => {
    throw new Error('cannot play');
  });
  await expect(f.speak(`${'a'.repeat(300)}. Next part.`)).rejects.toMatchObject({
    code: 'playback-failed',
  });
  expect(nextRequest?.aborted).toBe(true);
});

test('releases playback resources when starting the native player throws', async () => {
  const f = fixture();
  const failure = new Error('cannot play');
  f.player.play.mockImplementationOnce(() => {
    throw failure;
  });
  await expect(f.speak()).rejects.toMatchObject({ code: 'playback-failed', cause: failure });
  expect(f.player.release).toHaveBeenCalledTimes(1);
  expect(deleteFile).toHaveBeenCalledWith('file:///voice.wav');
});

test('uses the resolved model limit and voice for every chunk despite preference changes during playback', async () => {
  const f = fixture();
  f.ai.resolveSpeechConfiguration.mockResolvedValue({
    voice: 'Kore',
    maxInputCharacters: 8,
    mediaType: 'audio/wav',
  });
  let started!: () => void;
  const playing = new Promise<void>((resolve) => {
    started = resolve;
  });
  f.player.play.mockImplementationOnce(started);
  const pending = f.speak('One. Two. Three. Four.');
  await playing;
  f.preference.getMultipleRaw.mockResolvedValue({
    'feature.voice.speech_model': { providerId: 'other', modelId: 'other-tts' },
    'feature.voice.ai_voice': 'different-voice',
  });
  f.player.play.mockImplementation(() => f.finish());
  f.finish();
  await pending;
  expect(f.ai.generateSpeech.mock.calls.length).toBeGreaterThan(2);
  for (const [input] of f.ai.generateSpeech.mock.calls) {
    expect(input).toMatchObject({ providerId: 'aihubmix', modelId: 'tts-1', voice: 'Kore' });
    expect(input.text.length).toBeLessThanOrEqual(8);
  }
  expect(f.preference.getMultipleRaw).toHaveBeenCalledTimes(1);
});

test('rejects invalid voice configuration before audio generation', async () => {
  const f = fixture();
  f.ai.resolveSpeechConfiguration.mockRejectedValue(
    new VoiceError('invalid-voice', 'Unsupported voice'),
  );
  await expect(f.speak()).rejects.toMatchObject({ code: 'invalid-voice' });
  expect(f.ai.generateSpeech).not.toHaveBeenCalled();
  expect(createAudioPlayer).not.toHaveBeenCalled();
});

test('rejects a format mismatch before writing a wrongly named file', async () => {
  const f = fixture();
  f.ai.generateSpeech.mockResolvedValue({ audio: new Uint8Array([1]), mediaType: 'audio/mpeg' });
  await expect(f.speak()).rejects.toMatchObject({ code: 'failed' });
  expect(f.scratch.writeAudio).not.toHaveBeenCalled();
});
