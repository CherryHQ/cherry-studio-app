import type { FileEntry, FileEntryId } from '@cherrystudio/universal/data/types/file';

export type ResolvedFile = {
  entry: FileEntry;
  uri: string;
};

export type ImportFileInput = {
  name?: string;
  uri: string;
};

export interface FileModule {
  discardUnreferenced(id: FileEntryId): Promise<boolean>;
  import(input: ImportFileInput): Promise<ResolvedFile>;
  resolveUri(id: FileEntryId): Promise<string | undefined>;
}
