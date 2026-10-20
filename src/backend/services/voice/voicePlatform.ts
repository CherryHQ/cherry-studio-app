import { AudioModule } from 'expo-audio';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import type { DevicePermissions } from '@/backend/services/permissions';
import { MAX_VOICE_AUDIO_BYTES, VoiceError } from '@/shared/contracts/voice';

import type { VoiceStorage } from './createVoiceModule';

export function createVoicePlatform(permissions: Pick<DevicePermissions, 'runWithSystemPrompt'>) {
  const directory = new Directory(Paths.cache, 'Voice', randomUUID());
  const storage: VoiceStorage = {
    async readInput(uri, signal) {
      signal.throwIfAborted();
      if (!uri.startsWith('file://'))
        throw new VoiceError('invalid-input', 'Transcription requires a local audio file.');
      const file = new File(uri);
      if (!file.exists) throw new VoiceError('invalid-input', 'The audio file is unavailable.');
      if (file.size > MAX_VOICE_AUDIO_BYTES)
        throw new VoiceError('audio-too-large', 'The audio file exceeds the upload limit.');
      const bytes = await file.bytes();
      signal.throwIfAborted();
      return bytes;
    },
    async writeOutput(audio) {
      directory.create({ idempotent: true, intermediates: true });
      const id = randomUUID();
      const file = new File(directory, `${id}.wav`);
      try {
        file.write(audio);
        return { id, uri: file.uri };
      } catch (error) {
        if (file.exists) file.delete();
        throw error;
      }
    },
    async releaseOutput(audio) {
      const file = new File(directory, `${audio.id}.wav`);
      if (file.exists) file.delete();
    },
    async dispose() {
      if (directory.exists) directory.delete();
    },
  };
  return {
    storage,
    requestMicrophoneAccess: (signal: AbortSignal) =>
      permissions.runWithSystemPrompt(async () => {
        const current = await AudioModule.getRecordingPermissionsAsync();
        const permission =
          !current.granted && current.canAskAgain
            ? await AudioModule.requestRecordingPermissionsAsync()
            : current;
        return { granted: permission.granted, canAskAgain: permission.canAskAgain };
      }, signal),
  };
}
