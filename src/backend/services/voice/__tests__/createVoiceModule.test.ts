import { MAX_VOICE_AUDIO_BYTES, MAX_VOICE_TEXT_LENGTH } from '@/shared/contracts/voice';
import { ENDPOINT_TYPE } from '@/shared/data/types/model';
import { DEFAULT_API_FEATURES, type Provider } from '@/shared/data/types/provider';

import { createVoiceModule, type VoiceStorage } from '../createVoiceModule';

const target = { providerId: 'audio', modelId: 'voice-model' };
const speech = { ...target, text: 'Hello', voice: 'alloy' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  const storage = {
    readInput: jest.fn(async () => new Uint8Array([1, 2, 3])),
    writeOutput: jest.fn(async () => ({ id: 'output', uri: 'file:///cache/output.wav' })),
    releaseOutput: jest.fn(async () => undefined),
    dispose: jest.fn(async () => undefined),
  } satisfies VoiceStorage;
  const ai = {
    generateSpeech: jest.fn(async () => ({
      audio: new Uint8Array([1]),
      mediaType: 'audio/wav' as const,
    })),
    transcribe: jest.fn(async () => ({ text: '  你好  ', segments: [] })),
  };
  const configured: Provider = {
    id: 'audio',
    name: 'Audio',
    isEnabled: true,
    authType: 'api-key',
    apiKeys: [],
    apiFeatures: DEFAULT_API_FEATURES,
    settings: {},
    endpointConfigs: {
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
        adapterFamily: 'openai-compatible',
        baseUrl: 'https://voice.invalid',
      },
    },
  };
  const providers = {
    list: jest.fn(async () => [
      configured,
      { ...configured, id: 'disabled', isEnabled: false },
      { ...configured, id: 'unsupported', endpointConfigs: {} },
    ]),
  };
  return {
    ...createVoiceModule({
      ai,
      providers,
      storage,
      requestMicrophoneAccess: jest.fn(async () => ({ granted: false, canAskAgain: false })),
    }),
    ai,
    storage,
  };
}

describe('host-owned voice operations', () => {
  it('offers only enabled supported accounts and returns trimmed text without deleting its source', async () => {
    const f = fixture();
    expect(await f.module.listProviders()).toEqual([{ id: 'audio', name: 'Audio' }]);
    expect(await f.module.transcribe({ ...target, uri: 'file:///input.m4a' })).toBe('你好');
    expect(f.storage.releaseOutput).not.toHaveBeenCalled();
    await f.dispose();
  });

  it.each([0, MAX_VOICE_AUDIO_BYTES + 1])(
    'rejects invalid input size %i before uploading',
    async (size) => {
      const f = fixture();
      f.storage.readInput.mockResolvedValueOnce(new Uint8Array(size));
      await expect(
        f.module.transcribe({ ...target, uri: 'file:///input.m4a' }),
      ).rejects.toMatchObject({ code: size ? 'audio-too-large' : 'invalid-input' });
      expect(f.ai.transcribe).not.toHaveBeenCalled();
      await f.dispose();
    },
  );

  it('rejects empty recognition and excessive speech text without inventing output', async () => {
    const f = fixture();
    f.ai.transcribe.mockResolvedValueOnce({ text: '  ', segments: [] });
    await expect(
      f.module.transcribe({ ...target, uri: 'file:///input.m4a' }),
    ).rejects.toMatchObject({ code: 'empty-transcript' });
    await expect(
      f.module.generateSpeech({ ...speech, text: 'a'.repeat(MAX_VOICE_TEXT_LENGTH + 1) }),
    ).rejects.toMatchObject({ code: 'text-too-long' });
    expect(f.ai.generateSpeech).not.toHaveBeenCalled();
    await f.dispose();
  });

  it('owns only issued output IDs and releases each lease once', async () => {
    const f = fixture();
    const audio = await f.module.generateSpeech(speech);
    await f.module.releaseAudio('../external.wav');
    expect(f.storage.releaseOutput).not.toHaveBeenCalled();
    await f.module.releaseAudio(audio.id);
    await f.module.releaseAudio(audio.id);
    await f.dispose();
    expect(f.storage.releaseOutput).toHaveBeenCalledTimes(1);
    expect(f.storage.dispose).toHaveBeenCalledTimes(1);
  });

  it('rejects late transcripts after caller cancellation', async () => {
    const f = fixture();
    const result = deferred<{ text: string; segments: [] }>();
    f.ai.transcribe.mockReturnValueOnce(result.promise);
    const controller = new AbortController();
    const pending = f.module.transcribe(
      { ...target, uri: 'file:///input' },
      { signal: controller.signal },
    );
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    result.resolve({ text: 'late', segments: [] });
    await rejected;
    await f.dispose();
  });

  it('drains a file write cancelled by host disposal before deleting its directory', async () => {
    const f = fixture();
    const write = deferred<{ id: string; uri: string }>();
    const started = deferred<void>();
    f.storage.writeOutput.mockImplementationOnce(() => {
      started.resolve();
      return write.promise;
    });
    const pending = f.module.generateSpeech(speech);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await started.promise;
    const disposing = f.dispose();
    expect(f.storage.dispose).not.toHaveBeenCalled();
    write.resolve({ id: 'late', uri: 'file:///cache/late.wav' });
    await rejected;
    await disposing;
    await f.dispose();
    expect(f.storage.releaseOutput).toHaveBeenCalledWith({
      id: 'late',
      uri: 'file:///cache/late.wav',
    });
    expect(f.storage.releaseOutput.mock.invocationCallOrder[0]).toBeLessThan(
      f.storage.dispose.mock.invocationCallOrder[0],
    );
    expect(f.storage.dispose).toHaveBeenCalledTimes(1);
    await expect(f.module.listProviders()).rejects.toMatchObject({ name: 'AbortError' });
  });
});
