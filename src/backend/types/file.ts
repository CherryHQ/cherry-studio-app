import type { FileEntryId } from '@cherrystudio/universal/data/types/file';

export type PreparedInternalFile = {
  ext: string | null;
  id: FileEntryId;
  name: string;
  size: number;
  uri: string;
};
