import { aiFailureReasonTitleKey } from '@/frontend/components/AiFailure';
import { AiRequestError } from '@/shared/contracts/aiFailure';
import { VoiceError, type VoiceErrorCode } from '@/shared/contracts/voice';

const VOICE_ERROR_KEYS = {
  unsupported: 'voice.error.unsupported',
  'not-configured': 'voice.error.notConfigured',
  'permission-denied': 'voice.error.permissionDenied',
  'permission-blocked': 'voice.error.permissionDenied',
  busy: 'voice.error.busy',
  'no-speech': 'voice.error.noSpeech',
  'audio-too-large': 'voice.error.audioTooLarge',
  failed: 'voice.error.failed',
} satisfies Record<VoiceErrorCode, string>;

/** Labels come from closed codes; backend messages are diagnostics only. */
export function voiceErrorLabelKey(error: unknown): string {
  if (error instanceof VoiceError) return VOICE_ERROR_KEYS[error.code];
  if (error instanceof AiRequestError)
    return aiFailureReasonTitleKey(error.detail.failure.reasonCode) ?? VOICE_ERROR_KEYS.failed;
  return VOICE_ERROR_KEYS.failed;
}
