import type { FileEntry, FileEntryId } from '@cherrystudio/universal/data/types/file';

export type ResolvedFile = {
  entry: FileEntry;
  uri: string;
};

export type CreateInternalEntryInput = {
  name?: string;
  uri: string;
};

export interface FileModule {
  /** URI-source createInternalEntry; new entries use delete_when_unreferenced cleanup. */
  createInternalEntry(input: CreateInternalEntryInput): Promise<ResolvedFile>;
  /** Safe transient cleanup; unlike permanentDelete, referenced entries are preserved. */
  deleteIfUnreferenced(id: FileEntryId): Promise<boolean>;
  /** Mobile URI equivalent of Cherry Desktop's getUrl. */
  getUri(id: FileEntryId): Promise<string | undefined>;
}
