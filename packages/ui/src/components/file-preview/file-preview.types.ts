import type { ComponentType } from 'react';

/**
 * The kinds CherryUI classifies for callers that want a shared vocabulary. Only
 * `image` has a built-in renderer; the rest exist so a caller can name a file
 * precisely today and register a renderer for it later.
 */
export type BuiltInFilePreviewKind = 'document' | 'image' | 'pdf' | 'text';

/**
 * An open set: product code registers renderers for kinds CherryUI has never
 * heard of. The `string & {}` arm keeps editor completion for the built-ins
 * while still accepting any other tag.
 */
export type FilePreviewKind = BuiltInFilePreviewKind | (string & {});

export type FilePreviewOperation = 'open' | 'thumbnail';

export type FilePreviewFile = {
  displayName: string;
  extensionLabel: string;
  id: string;
  kind: FilePreviewKind;
  previewUri?: string;
  revision: number | string;
  uri: string;
};

export type FilePreviewLabels = {
  openWith: string;
  unavailable: string;
};

/**
 * What every renderer receives, built-in or registered. A renderer draws the
 * preview only: the frame, press target, and system opening stay with
 * `FilePreview` so a plugin cannot diverge on interaction.
 */
export type FilePreviewComponentProps = {
  file: FilePreviewFile;
  onError?: (error: Error, operation: FilePreviewOperation) => void;
  size: number;
};

export type FilePreviewComponent = ComponentType<FilePreviewComponentProps>;

export type FilePreviewPlugin = {
  component: FilePreviewComponent;
  kind: FilePreviewKind;
};

export type FilePreviewProps = {
  file?: FilePreviewFile | null;
  labels: FilePreviewLabels;
  onError?: (error: Error, operation: FilePreviewOperation) => void;
  size?: number;
};
