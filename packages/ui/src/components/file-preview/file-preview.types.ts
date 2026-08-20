export type FilePreviewKind = 'document' | 'image';
export type FilePreviewOperation = 'open' | 'thumbnail';

export type FilePreviewFile = {
  displayName: string;
  extensionLabel: string;
  id: string;
  kind: FilePreviewKind;
  revision: number | string;
  uri: string;
};

export type FilePreviewLabels = {
  loading: string;
  openWith: string;
  unavailable: string;
};

export type FilePreviewProps = {
  file?: FilePreviewFile | null;
  isLoading?: boolean;
  labels: FilePreviewLabels;
  onError?: (error: Error, operation: FilePreviewOperation) => void;
  size?: number;
};
