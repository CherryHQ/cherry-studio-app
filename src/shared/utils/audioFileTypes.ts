import { filenameExtension } from '@/shared/data/types/file';

/** OpenAI's transcription upload limit, which compatible gateways share. */
export const MAX_AUDIO_ATTACHMENT_BYTES = 25 * 1000 * 1000;

// The formats the OpenAI transcription protocol accepts. Uploads are named after the media
// type's subtype, so each maps to the type whose name the protocol recognizes.
const EXTENSION_MEDIA_TYPES = new Map([
  ['flac', 'audio/flac'],
  ['m4a', 'audio/mp4'],
  ['mp3', 'audio/mpeg'],
  ['mp4', 'audio/mp4'],
  ['mpeg', 'audio/mpeg'],
  ['mpga', 'audio/mpeg'],
  ['oga', 'audio/ogg'],
  ['ogg', 'audio/ogg'],
  ['wav', 'audio/wav'],
  ['webm', 'audio/webm'],
]);
const CANONICAL_MEDIA_TYPES = new Map([
  ['audio/flac', 'audio/flac'],
  ['audio/m4a', 'audio/mp4'],
  ['audio/mp3', 'audio/mpeg'],
  ['audio/mp4', 'audio/mp4'],
  ['audio/mpeg', 'audio/mpeg'],
  ['audio/ogg', 'audio/ogg'],
  ['audio/wav', 'audio/wav'],
  ['audio/wave', 'audio/wav'],
  ['audio/webm', 'audio/webm'],
  ['audio/x-flac', 'audio/flac'],
  ['audio/x-m4a', 'audio/mp4'],
  ['audio/x-wav', 'audio/wav'],
]);

/**
 * The upload type of a transcribable file, or undefined when it is not one. Pickers often label
 * audio as a generic or video type, so the extension decides first.
 */
export function transcriptionMediaType(file: { mediaType: string; name: string }) {
  const extension = filenameExtension(file.name);
  const mediaType = file.mediaType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return (
    (extension ? EXTENSION_MEDIA_TYPES.get(extension) : undefined) ??
    CANONICAL_MEDIA_TYPES.get(mediaType)
  );
}

export function isTranscribableAudio(file: { mediaType: string; name: string }): boolean {
  return transcriptionMediaType(file) !== undefined;
}

/** A generated container keeps its declared format; an unknown type must not be named WAV. */
export function generatedAudioExtension(mediaType: string): string | undefined {
  const canonical = CANONICAL_MEDIA_TYPES.get(mediaType.toLowerCase());
  if (!canonical) return undefined;
  return [...EXTENSION_MEDIA_TYPES].find(([, type]) => type === canonical)?.[0];
}
