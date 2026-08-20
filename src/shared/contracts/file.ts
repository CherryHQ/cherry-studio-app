import type { FileEntry, FileEntryId } from '@cherrystudio/universal/data/types/file';

export type ResolvedFile = {
  entry: FileEntry;
  uri: string;
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
  /** Mobile URI equivalent of Cherry Desktop's getUrl. */
  getUri(id: FileEntryId): Promise<string | undefined>;
}
