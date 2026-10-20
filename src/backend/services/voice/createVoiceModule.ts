import { resolveVoiceEndpoint } from '@cherrystudio/ai-runtime/provider';

import type { ProviderService } from '@/backend/data/services/ProviderService';
import { linkAbortSignals } from '@/backend/utils/linkAbortSignals';
import {
  MAX_VOICE_AUDIO_BYTES,
  MAX_VOICE_TEXT_LENGTH,
  VoiceError,
  type SpeechInput,
  type VoiceModelSelection,
  type VoiceAudio,
  type VoiceModule,
  type VoiceRequestOptions,
} from '@/shared/contracts/voice';

export type VoiceStorage = {
  readInput(uri: string, signal: AbortSignal): Promise<Uint8Array>;
  writeOutput(audio: Uint8Array): Promise<VoiceAudio>;
  releaseOutput(audio: VoiceAudio): Promise<void>;
  dispose(): Promise<void>;
};

export function createVoiceModule({
  ai,
  providers,
  storage,
  requestMicrophoneAccess,
}: {
  ai: {
    generateSpeech(input: SpeechInput, signal: AbortSignal): Promise<{ audio: Uint8Array }>;
    transcribe(
      input: VoiceModelSelection & { audio: Uint8Array },
      signal: AbortSignal,
    ): Promise<{ text: string }>;
  };
  providers: Pick<ProviderService, 'list'>;
  storage: VoiceStorage;
  requestMicrophoneAccess(signal: AbortSignal): Promise<{ granted: boolean; canAskAgain: boolean }>;
}): { module: VoiceModule; dispose(): Promise<void> } {
  const lifetime = new AbortController();
  const pending = new Set<Promise<unknown>>();
  const outputs = new Map<string, VoiceAudio>();
  let disposal: Promise<void> | undefined;

  async function run<T>(
    options: VoiceRequestOptions | undefined,
    operation: (signal: AbortSignal) => Promise<T>,
    discard?: (value: T) => Promise<void>,
  ): Promise<T> {
    lifetime.signal.throwIfAborted();
    const linked = linkAbortSignals(
      options?.signal ? [lifetime.signal, options.signal] : [lifetime.signal],
    );
    const work = Promise.resolve().then(async () => {
      try {
        linked.signal.throwIfAborted();
        const value = await operation(linked.signal);
        if (linked.signal.aborted) await discard?.(value);
        linked.signal.throwIfAborted();
        return value;
      } finally {
        linked.dispose();
      }
    });
    pending.add(work);
    try {
      return await work;
    } finally {
      pending.delete(work);
    }
  }

  const module: VoiceModule = {
    listProviders: (options) =>
      run(options, async (signal) => {
        const configured = await providers.list({ enabled: true });
        signal.throwIfAborted();
        return configured
          .filter((provider) => provider.isEnabled && resolveVoiceEndpoint(provider))
          .map(({ id, name }) => ({ id, name }));
      }),
    requestMicrophoneAccess: (options) => run(options, requestMicrophoneAccess),
    transcribe: (input, options) =>
      run(options, async (signal) => {
        const audio = await storage.readInput(input.uri, signal);
        signal.throwIfAborted();
        if (!audio.length) throw new VoiceError('invalid-input', 'The audio file is empty.');
        if (audio.length > MAX_VOICE_AUDIO_BYTES)
          throw new VoiceError('audio-too-large', 'The audio file exceeds the upload limit.');
        const result = await ai.transcribe({ ...input, audio }, signal);
        signal.throwIfAborted();
        const text = result.text.trim();
        if (!text) throw new VoiceError('empty-transcript', 'No speech was recognized.');
        return text;
      }),
    generateSpeech: (input, options) =>
      run(
        options,
        async (signal) => {
          if (!input.text.trim() || !input.voice.trim())
            throw new VoiceError('invalid-input', 'Text and a voice ID are required.');
          if (input.text.length > MAX_VOICE_TEXT_LENGTH)
            throw new VoiceError('text-too-long', 'The text exceeds the speech request limit.');
          const result = await ai.generateSpeech({ ...input, voice: input.voice.trim() }, signal);
          signal.throwIfAborted();
          if (!result.audio.length || result.audio.length > MAX_VOICE_AUDIO_BYTES)
            throw new VoiceError(
              'failed',
              'The generated audio is empty or exceeds the output limit.',
            );
          const audio = await storage.writeOutput(result.audio);
          if (signal.aborted) {
            await storage.releaseOutput(audio);
            signal.throwIfAborted();
          }
          outputs.set(audio.id, audio);
          return audio;
        },
        (audio) => module.releaseAudio(audio.id),
      ),
    async releaseAudio(id) {
      const audio = outputs.get(id);
      if (!audio) return;
      outputs.delete(id);
      await storage.releaseOutput(audio);
    },
  };

  return {
    module,
    dispose() {
      disposal ??= (async () => {
        lifetime.abort();
        await Promise.allSettled([...pending]);
        await Promise.allSettled([...outputs.keys()].map((id) => module.releaseAudio(id)));
        await storage.dispose();
      })();
      return disposal;
    },
  };
}
