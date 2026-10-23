import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

/** Per-host scratch space for generated speech; removed with the host. */
export function createVoiceScratch() {
  const directory = new Directory(Paths.cache, 'Voice', randomUUID());
  return {
    writeAudio(bytes: Uint8Array, extension: string): File {
      directory.create({ idempotent: true, intermediates: true });
      const file = new File(directory, `${randomUUID()}.${extension}`);
      file.write(bytes);
      return file;
    },
    dispose() {
      if (directory.exists) directory.delete();
    },
  };
}

export type VoiceScratch = ReturnType<typeof createVoiceScratch>;

/** Reads a finished recording and deletes it; recordings are never kept. */
export async function takeRecording(uri: string): Promise<Uint8Array> {
  const file = new File(uri);
  try {
    return await file.bytes();
  } finally {
    deleteFile(uri);
  }
}

export function deleteFile(uri: string | null | undefined) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Cache files the system already reclaimed need no cleanup.
  }
}
