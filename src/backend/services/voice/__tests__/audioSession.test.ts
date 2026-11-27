import { setAudioModeAsync } from 'expo-audio';
import { Platform } from 'react-native';

import { voiceAudioSession } from '../audioSession';

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-audio', () => ({ setAudioModeAsync: jest.fn() }));
jest.mock('../../../../../modules/system-integration', () => ({
  getSystemIntegration: () => null,
}));

afterEach(() => {
  jest.restoreAllMocks();
});

test('serializes playback mode updates and evaluates live background getters at execution time', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  let allowFirstMode!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    allowFirstMode = resolve;
  });
  const calls: { shouldPlayInBackground?: boolean; interruptionMode?: string }[] = [];

  jest
    .mocked(setAudioModeAsync)
    .mockImplementationOnce(async (mode) => {
      await firstGate;
      calls.push({
        shouldPlayInBackground: mode.shouldPlayInBackground,
        interruptionMode: mode.interruptionMode,
      });
    })
    .mockImplementationOnce(async (mode) => {
      calls.push({
        shouldPlayInBackground: mode.shouldPlayInBackground,
        interruptionMode: mode.interruptionMode,
      });
    });

  let backgroundAllowed = true;
  const cleanupFirst = voiceAudioSession.playback(false);
  const queuedSpeech = voiceAudioSession.playback(() => backgroundAllowed);

  await Promise.resolve();
  // Revoking background admission before the first audio-mode call settles flips the queued getter.
  expect(setAudioModeAsync).toHaveBeenCalledTimes(1);
  backgroundAllowed = false;
  allowFirstMode();

  await Promise.all([cleanupFirst, queuedSpeech]);
  expect(setAudioModeAsync).toHaveBeenCalledTimes(2);
  expect(calls).toEqual([
    { shouldPlayInBackground: false, interruptionMode: 'doNotMix' },
    { shouldPlayInBackground: false, interruptionMode: 'doNotMix' },
  ]);
});
