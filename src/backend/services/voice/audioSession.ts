import { setAudioModeAsync } from 'expo-audio';
import { Platform } from 'react-native';

import { loggerService } from '@/shared/core/logger/LoggerService';

import { getSystemIntegration } from '../../../../modules/system-integration';

let nextAudioUseId = 0;
const logger = loggerService.withContext('VoiceAudioSession');

/**
 * The one place voice configures the shared iOS audio session; expo-speech uses it too. Reading
 * aloud is requested media playback, so it plays with the ring switch silenced.
 */
export const voiceAudioSession = {
  playback: () =>
    setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      // The voice runtime still stops reading on background entry without consent.
      shouldPlayInBackground: Platform.OS === 'ios',
    }),
  /** Release only after the native speech/capture operation has actually settled. */
  async acquire(kind: 'speech' | 'capture'): Promise<() => Promise<void>> {
    const native = Platform.OS === 'ios' ? getSystemIntegration() : null;
    const id = `voice-${++nextAudioUseId}`;
    await native?.beginBackgroundAudioUse?.(id, kind);
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      try {
        await native?.endBackgroundAudioUse?.(id);
      } catch (error) {
        logger.warn('Audio session cleanup failed', { error });
      }
    };
  },
};
