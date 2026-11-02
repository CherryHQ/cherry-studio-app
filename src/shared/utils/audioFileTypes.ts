import { FALLBACK_MEDIA_TYPE, filenameExtension } from '@/shared/data/types/file';

const audioMediaTypes = new Map([
  ['aac', 'audio/aac'],
  ['aif', 'audio/aiff'],
  ['aiff', 'audio/aiff'],
  ['amr', 'audio/amr'],
  ['caf', 'audio/x-caf'],
  ['flac', 'audio/flac'],
  ['m4a', 'audio/mp4'],
  ['mp3', 'audio/mpeg'],
  ['oga', 'audio/ogg'],
  ['ogg', 'audio/ogg'],
  ['opus', 'audio/opus'],
  ['wav', 'audio/wav'],
]);

/** Infer only at import, preserving a specific type supplied by the picker. */
export function resolveAudioImportMediaType(name: string, mediaType?: string): string {
  if (mediaType && mediaType.toLowerCase() !== FALLBACK_MEDIA_TYPE) return mediaType;
  return audioMediaTypes.get(filenameExtension(name) ?? '') ?? mediaType ?? FALLBACK_MEDIA_TYPE;
}

/** Audio attachments stay local; models receive a managed reference for transcription. */
export function isAudioMediaType(mediaType: string): boolean {
  return mediaType.split(';')[0]!.trim().toLowerCase().startsWith('audio/');
}

export const MAX_AUDIO_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_AUDIO_DURATION_SECONDS = 2 * 60 * 60;
