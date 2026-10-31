import { VoiceError, type VoiceErrorCode } from '@/shared/contracts/voice';

const VOICE_ERROR_KEYS = {
  unsupported: 'voice.error.unsupported',
  'not-configured': 'voice.error.notConfigured',
  'offline-recognition-unavailable': 'voice.error.offlineRecognitionUnavailable',
  'recognition-not-configured': 'settings.voice.dictation.setupRequired',
  'model-not-downloaded': 'voice.error.modelNotDownloaded',
  'permission-denied': 'voice.error.permissionDenied',
  'permission-blocked': 'voice.error.permissionDenied',
  'invalid-voice': 'voice.error.invalidVoice',
  busy: 'voice.error.busy',
  'no-speech': 'voice.error.noSpeech',
  failed: 'voice.error.failed',
  'invalid-audio': 'voice.error.invalidAudio',
  'audio-too-long': 'voice.error.audioTooLong',
  'file-too-large': 'voice.error.fileTooLarge',
  'file-unavailable': 'filePreview.unavailable',
} satisfies Record<VoiceErrorCode, string>;

/** Labels come from closed codes; backend messages are diagnostics only. */
export function voiceErrorLabelKey(error: unknown): string {
  return voiceErrorCodeLabelKey(error instanceof VoiceError ? error.code : undefined);
}

/** Persisted tool outcomes carry a code, not an Error instance. */
export function voiceErrorCodeLabelKey(code: unknown): string {
  return typeof code === 'string' && Object.hasOwn(VOICE_ERROR_KEYS, code)
    ? VOICE_ERROR_KEYS[code as VoiceErrorCode]
    : VOICE_ERROR_KEYS.failed;
}
