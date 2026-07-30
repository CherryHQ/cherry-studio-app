import type { FileEntry, FileEntryId } from '@/shared/data/types/file';

export type ResolvedFile = {
  entry: FileEntry;
  uri: string;
};

export type FileSchemas = {
  '/files/:id': {
    GET: {
      params: { id: FileEntryId };
      response: FileEntry | null;
    };
  };
  '/files/:id/renderable-uri': {
    GET: {
      params: { id: FileEntryId };
      response: string | null;
    };
  };
  '/files/:id/resolved': {
    GET: {
      params: { id: FileEntryId };
      response: ResolvedFile | null;
    };
  };
};
