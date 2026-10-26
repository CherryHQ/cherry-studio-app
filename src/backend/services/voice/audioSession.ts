import { setAudioModeAsync } from 'expo-audio';

/**
 * The one place voice configures the shared iOS audio session; expo-speech uses it too. Reading
 * aloud is requested media playback, so it plays with the ring switch silenced, and ending a
 * recording returns to that mode instead of the silenced default.
 */
export const voiceAudioSession = {
  playback: () =>
    setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
    }),
  recording: () =>
    setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      allowsBackgroundRecording: false,
    }),
};
