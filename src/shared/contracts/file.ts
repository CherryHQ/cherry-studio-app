import type { FileEntry, FileEntryId } from '@/shared/data/types/file';

export type ResolvedFile = {
  entry: FileEntry;
  uri: string;
};

export type ResolvedFileUris = {
  /** Small image thumbnail when available; the original URI for other file kinds. */
  previewUri: string | undefined;
  /** Original managed file URI used when opening the file. */
  uri: string | undefined;
};

export type CreateInternalEntryInput = {
  /** Authoritative media type from the picker; extension inference is the fallback. */
  mediaType?: string;
  name?: string;
  uri: string;
};

export interface FileModule {
  /** Copies the transient source URI into managed storage and creates the entry. */
  createInternalEntry(input: CreateInternalEntryInput): Promise<ResolvedFile>;
  /** Hard-delete: removes the entry row and its bytes (composer cancel-upload). */
  delete(id: FileEntryId): Promise<boolean>;
  /** Generates or reads one image preview without re-reading its database row. */
  generatePreviewUri(entry: FileEntry): Promise<string | undefined>;
  /** Mobile URI equivalent of Cherry Desktop's getUrl. */
  getUri(id: FileEntryId): Promise<string | undefined>;
  /** Resolves a database page without re-reading entries one by one. */
  resolveUris(entries: readonly FileEntry[]): Promise<ResolvedFileUris[]>;
}
