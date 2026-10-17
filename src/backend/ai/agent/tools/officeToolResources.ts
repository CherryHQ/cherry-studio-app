import { createConcurrencySlots } from '@/backend/utils/concurrencySlots';
import type { FileEntry, FileEntryProvenance } from '@/shared/data/types/file';
import type { FilePlacement } from '@/shared/data/types/fileLibrary';

import type { ManagedFileResolver } from '../resources/managedFileResolver';

export type OfficeFiles = Pick<
  ManagedFileResolver,
  'readImage' | 'readAsBytes' | 'resolveAvailable'
> & {
  createBytesEntry(
    input: FilePlacement & {
      data: Uint8Array;
      mediaType: string;
      name: string;
      provenance: FileEntryProvenance;
    },
    signal: AbortSignal,
  ): Promise<FileEntry>;
};

// Source/image reads, native compute and publication share a bounded lifetime.
export const officeOperationSlots = createConcurrencySlots(2);
