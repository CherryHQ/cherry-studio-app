import type { FileEntry, FileEntryId } from '@/shared/data/types/file';

export type ResolvedFile = {
  entry: FileEntry;
  uri: string;
};

export interface FilesBackend {
  get(id: FileEntryId): Promise<FileEntry | null>;
  resolve(id: FileEntryId): Promise<ResolvedFile | null>;
  resolveRenderableUri(id: FileEntryId): Promise<string | undefined>;
}
