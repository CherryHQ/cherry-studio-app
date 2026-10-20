import { filenameExtension } from '@/shared/data/types/file';

/** OpenAI's transcription upload limit, which compatible gateways share. */
export const MAX_AUDIO_ATTACHMENT_BYTES = 25 * 1000 * 1000;

// The formats the OpenAI transcription protocol accepts.
const AUDIO_EXTENSIONS = new Set([
  'flac',
  'm4a',
  'mp3',
  'mp4',
  'mpeg',
  'mpga',
  'oga',
  'ogg',
  'wav',
  'webm',
]);
const AUDIO_MEDIA_TYPES = new Set([
  'audio/flac',
  'audio/m4a',
  'audio/mp3',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/wave',
  'audio/webm',
  'audio/x-flac',
  'audio/x-m4a',
  'audio/x-wav',
]);

/** Pickers often label audio as a generic or video type, so the extension also qualifies it. */
export function isTranscribableAudio(file: { mediaType: string; name: string }): boolean {
  const mediaType = file.mediaType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (AUDIO_MEDIA_TYPES.has(mediaType)) return true;
  const extension = filenameExtension(file.name);
  return !!extension && AUDIO_EXTENSIONS.has(extension);
}
