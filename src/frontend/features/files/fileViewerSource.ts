import type { FilePreviewSource, ResolvedFile } from '@/shared/contracts/file';

/** Temporary sources have display metadata, never managed-file authority. */
export type FileViewerSource =
  | (ResolvedFile & { kind: 'managed' })
  | (FilePreviewSource & { kind: 'temporary' });
