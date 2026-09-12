import type { FilePreviewFile, FilePreviewLabels } from '../../file-preview.types';

export type OpenFilePreviewInput = {
  file: FilePreviewFile;
  labels: FilePreviewLabels;
};
