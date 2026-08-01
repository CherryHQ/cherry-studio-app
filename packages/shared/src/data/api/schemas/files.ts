import type { FileEntry, FileEntryId, ResolvedFile } from '@/shared/data/types/file';

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
