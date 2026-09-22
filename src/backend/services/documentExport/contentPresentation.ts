import type { ExportContentLabels } from '@/shared/contracts/documentExport';
import { filenameExtension } from '@/shared/data/types/file';
import { documentFileTypeFromMediaType } from '@/shared/utils/documentFileTypes';

/** Programmatic callers can omit labels; application entry points supply resolved copy. */
export const DEFAULT_CONTENT_LABELS: ExportContentLabels = {
  code: 'Code',
  codeOmitted: 'Code content omitted',
  file: 'File',
  fileMetadataOnly: 'File information only; attachment not included.',
  image: 'Image',
  imageUnavailable: 'Image unavailable',
  sources: 'Sources',
  table: 'Table',
};

export function exportFileType(name: string, mediaType?: string) {
  const type = (mediaType && documentFileTypeFromMediaType(mediaType)) || filenameExtension(name);
  return type && /^[a-z\d]{1,12}$/i.test(type) ? type.toUpperCase() : undefined;
}
