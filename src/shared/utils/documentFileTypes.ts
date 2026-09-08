import { FALLBACK_MEDIA_TYPE, filenameExtension } from '@/shared/data/types/file';

const documentMediaTypes = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

export type DocumentFileType = keyof typeof documentMediaTypes;

export function documentFileTypeFromMediaType(mediaType: string): DocumentFileType | undefined {
  const normalized = mediaType.toLowerCase();
  return (Object.keys(documentMediaTypes) as DocumentFileType[]).find(
    (type) => documentMediaTypes[type] === normalized,
  );
}

/** Infer only at import, when the picker has supplied no specific type. */
export function resolveDocumentImportMediaType(name: string, mediaType?: string): string {
  if (mediaType && mediaType.toLowerCase() !== FALLBACK_MEDIA_TYPE) return mediaType;
  const extension = filenameExtension(name);
  return (
    Object.entries(documentMediaTypes).find(([type]) => type === extension)?.[1] ??
    mediaType ??
    FALLBACK_MEDIA_TYPE
  );
}
