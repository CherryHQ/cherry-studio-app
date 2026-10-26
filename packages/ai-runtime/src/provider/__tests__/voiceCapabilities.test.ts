import { describe, expect, it } from 'vitest';

import { resolveSpeechVoice, resolveVoiceCapabilities } from '../voiceCapabilities';
import { getAihubmixVoiceModelMetadata } from '../voiceModelMetadata';

describe('speech capabilities', () => {
  it.each(['gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts'])(
    'uses a native Gemini default for %s and rejects incompatible explicit choices',
    (modelId) => {
      const capabilities = resolveVoiceCapabilities('aihubmix', modelId, 'speech');
      expect(capabilities?.operation).toBe('speech');
      if (capabilities?.operation !== 'speech') throw new Error('Expected speech capabilities');
      expect(resolveSpeechVoice(capabilities)).toBe('Kore');
      expect(resolveSpeechVoice(capabilities, '')).toBe('Kore');
      expect(resolveSpeechVoice(capabilities, 'Zephyr')).toBe('Zephyr');
      expect(resolveSpeechVoice(capabilities, 'alloy')).toBeUndefined();
      expect(resolveSpeechVoice(capabilities, 'kore')).toBeUndefined();
      expect(getAihubmixVoiceModelMetadata(modelId)?.outputModalities).toEqual(['audio']);
    },
  );

  it.each([
    ['tts-1', false],
    ['openai/tts-1-hd-1106', false],
    ['gpt-4o-mini-tts', true],
    ['gpt-4o-mini-tts-2025-12-15', true],
  ])('keeps OpenAI model %s within its supported voice set', (modelId, supportsAsh) => {
    const capabilities = resolveVoiceCapabilities('openai', modelId, 'speech');
    if (capabilities?.operation !== 'speech') throw new Error('Expected speech capabilities');
    expect(resolveSpeechVoice(capabilities)).toBe('alloy');
    expect(resolveSpeechVoice(capabilities, 'ash')).toBe(supportsAsh ? 'ash' : undefined);
  });

  it('does not invent a default or a voice catalog for a custom compatible model', () => {
    const capabilities = resolveVoiceCapabilities('openai-compatible', 'my-voice-model', 'speech');
    if (capabilities?.operation !== 'speech') throw new Error('Expected speech capabilities');
    expect(capabilities.voices).toEqual([]);
    expect(resolveSpeechVoice(capabilities)).toBeUndefined();
    expect(resolveSpeechVoice(capabilities, 'Speaker-42')).toBe('Speaker-42');
  });

  it('keeps unsupported protocols, unknown gateway models and wrong operations out', () => {
    expect(resolveVoiceCapabilities('anthropic', 'tts-1', 'speech')).toBeUndefined();
    expect(resolveVoiceCapabilities('aihubmix', 'unknown-tts', 'speech')).toBeUndefined();
    expect(resolveVoiceCapabilities('aihubmix', 'whisper-1', 'speech')).toBeUndefined();
    expect(resolveVoiceCapabilities('openai', 'tts-1', 'transcription')).toBeUndefined();
  });
});
