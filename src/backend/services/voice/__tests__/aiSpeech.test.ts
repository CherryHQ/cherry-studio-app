import { type AudioStatus, createAudioPlayer, setAudioModeAsync } from 'expo-audio';

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
    ai: { generateSpeech: jest.fn(async () => ({ audio: new Uint8Array([1, 2, 3]) })) },
    preference: {
      get: jest
        .fn()
        .mockImplementation(async (key: string) =>
          key === 'feature.voice.ai_voice' ? 'alloy' : { providerId: 'aihubmix', modelId: 'tts-1' },
        ),
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
    .mockResolvedValueOnce({ audio: new Uint8Array([1]) })
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

test('releases playback resources when starting the native player throws', async () => {
  const f = fixture();
  const failure = new Error('cannot play');
  f.player.play.mockImplementationOnce(() => {
    throw failure;
  });
  await expect(f.speak()).rejects.toBe(failure);
  expect(f.player.release).toHaveBeenCalledTimes(1);
  expect(deleteFile).toHaveBeenCalledWith('file:///voice.wav');
});
