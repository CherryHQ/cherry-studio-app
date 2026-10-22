import {
  VoiceError,
  type VoiceEngineStatus,
  type VoiceModelSelection,
} from '@/shared/contracts/voice';

/** Audio bytes and their container type, which the upload is named after. */
export type TranscriptionAudio = { audio: Uint8Array; mediaType: string };

export type TranscriptionResult = {
  text: string;
  segments: { text: string; startSecond: number; endSecond: number }[];
  language?: string;
  durationInSeconds?: number;
};

export type AiTranscriptionDependencies = {
  ai: {
    transcribe(
      input: VoiceModelSelection & TranscriptionAudio,
      signal: AbortSignal,
    ): Promise<TranscriptionResult>;
  };
  preference: {
    get(key: 'feature.voice.transcription_model'): Promise<VoiceModelSelection | null>;
  };
};

/** The configured transcription model, shared by AI dictation and audio file attachments. */
export function createAiTranscriber({ ai, preference }: AiTranscriptionDependencies) {
  const selection = async () => {
    const model = await preference.get('feature.voice.transcription_model');
    return model?.providerId && model.modelId.trim() ? model : null;
  };
  return {
    selection,
    async status(): Promise<VoiceEngineStatus> {
      return (await selection()) ? 'ready' : 'needs-setup';
    },
    async transcribe(
      audio: TranscriptionAudio,
      signal: AbortSignal,
      model?: VoiceModelSelection,
    ): Promise<TranscriptionResult> {
      const configured = model ?? (await selection());
      signal.throwIfAborted();
      if (!configured)
        throw new VoiceError('not-configured', 'No transcription model is configured.');
      return ai.transcribe({ ...configured, ...audio }, signal);
    },
  };
}

export type AiTranscriber = ReturnType<typeof createAiTranscriber>;
