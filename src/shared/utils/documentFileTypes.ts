import { FALLBACK_MEDIA_TYPE, filenameExtension } from '@/shared/data/types/file';

const documentMediaTypes = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  doc: 'application/msword',
  ppt: 'application/vnd.ms-powerpoint',
  xls: 'application/vnd.ms-excel',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  rtf: 'application/rtf',
  epub: 'application/epub+zip',
} as const;

export type DocumentFileType = keyof typeof documentMediaTypes;
export type BuiltinOfficeFileType = 'docx' | 'pptx' | 'xlsx';

export function isBuiltinOfficeFileType(type: DocumentFileType): type is BuiltinOfficeFileType {
  return type === 'docx' || type === 'pptx' || type === 'xlsx';
}

export function documentFileTypeFromMediaType(mediaType: string): DocumentFileType | undefined {
  const normalized = mediaType.toLowerCase();
  if (normalized === 'text/rtf') return 'rtf';
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
