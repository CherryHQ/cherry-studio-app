import { VoiceError, type VoiceErrorCode } from '@/shared/contracts/voice';

const VOICE_ERROR_KEYS = {
  unsupported: 'voice.error.unsupported',
  'not-configured': 'voice.error.notConfigured',
  'recognition-not-configured': 'settings.voice.dictation.setupRequired',
  'model-not-downloaded': 'voice.error.modelNotDownloaded',
  'permission-denied': 'voice.error.permissionDenied',
  'permission-blocked': 'voice.error.permissionDenied',
  'invalid-voice': 'voice.error.invalidVoice',
  busy: 'voice.error.busy',
  'no-speech': 'voice.error.noSpeech',
  failed: 'voice.error.failed',
} satisfies Record<VoiceErrorCode, string>;

/** Labels come from closed codes; backend messages are diagnostics only. */
export function voiceErrorLabelKey(error: unknown): string {
  if (error instanceof VoiceError) return VOICE_ERROR_KEYS[error.code];
  return VOICE_ERROR_KEYS.failed;
}
