import type { fileContent } from '@/backend/services/file/fileContent';
import {
  VoiceError,
  type AudioTranscriptionInput,
  type AudioTranscriptionOptions,
} from '@/shared/contracts/voice';
import { FileEntryIdSchema, readableFilename } from '@/shared/data/types/file';
import { isAudioMediaType, MAX_AUDIO_FILE_BYTES } from '@/shared/utils/audioFileTypes';

type Transcribe = (
  uri: string,
  options: AudioTranscriptionOptions & { signal: AbortSignal },
) => Promise<{ text: string; durationSeconds: number }>;

/** The UI and Agent tool publish the same managed transcript; neither receives a raw file path. */
export async function transcribeAudioFile(
  files: Pick<typeof fileContent, 'resolve' | 'createTextEntry' | 'delete'>,
  transcribe: Transcribe,
  input: AudioTranscriptionInput,
  options: AudioTranscriptionOptions & { signal: AbortSignal },
) {
  const { signal } = options;
  signal.throwIfAborted();
  const source = await files.resolve(FileEntryIdSchema.parse(input.fileEntryId));
  if (!source) throw new VoiceError('file-unavailable', 'The audio file is unavailable.');
  if (!isAudioMediaType(source.entry.mediaType))
    throw new VoiceError('invalid-audio', 'Choose an audio file.');
  if (source.entry.size > MAX_AUDIO_FILE_BYTES)
    throw new VoiceError('file-too-large', 'The audio file exceeds the 100 MiB limit.');
  const result = await transcribe(source.uri, options);
  signal.throwIfAborted();
  const current = await files.resolve(source.entry.id);
  if (!current || current.entry.updatedAt !== source.entry.updatedAt)
    throw new VoiceError('file-unavailable', 'The source recording changed or became unavailable.');
  const entry = await files.createTextEntry(
    {
      data: `${result.text}\n`,
      name: readableFilename(source.entry.filename.replace(/\.[^.]+$/, ''), {
        extension: 'txt',
        fallback: 'transcript',
      }),
      mediaType: 'text/plain',
      provenance: 'generated',
      folderId: input.folderId ?? null,
      workspaceFolderId: input.folderId ?? null,
    },
    signal,
  );
  if (signal.aborted) {
    await files.delete(entry.id);
    signal.throwIfAborted();
  }
  return { entry, durationSeconds: result.durationSeconds };
}
