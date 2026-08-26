import { fileEntryService } from '@/backend/data/services/FileEntryService';
import { getInternalFileUri } from '@/backend/services/file/fileStorage';
import type { AgentMessageView } from '@/shared/contracts/agent';
import type { FileEntry, FileEntryId } from '@/shared/data/types/file';
import { FileEntryIdSchema } from '@/shared/data/types/file';

export type ManagedFileFact = {
  fileEntryId: FileEntryId;
  mediaType: string;
  name: string;
  size: number;
};

export type TurnResourceLedger = {
  /** Managed ids explicitly referenced by the current input or visible history. */
  fileEntryIds: ReadonlySet<string>;
  /** Current input facts validated before the message reservation. */
  inputFiles: ReadonlyMap<string, ManagedFileFact>;
};

/** Host-only managed-file boundary. It never exposes a device path to Pi. */
export interface ManagedFileResolver {
  resolveAvailable(
    fileEntryIds: readonly FileEntryId[],
  ): Promise<ReadonlyMap<string, ManagedFileFact>>;
}

type AvailableFileEntries = {
  findAvailableByIds(ids: readonly FileEntryId[]): Promise<FileEntry[]>;
};

export function createManagedFileResolver(
  entries: AvailableFileEntries,
  getUri: (entry: Pick<FileEntry, 'filename' | 'id'>) => string | undefined,
): ManagedFileResolver {
  return {
    async resolveAvailable(fileEntryIds) {
      const uniqueIds = [...new Set(fileEntryIds)];
      const availableEntries = await entries.findAvailableByIds(uniqueIds);
      const facts = new Map<string, ManagedFileFact>();

      for (const entry of availableEntries) {
        if (!getUri(entry)) {
          continue;
        }
        facts.set(entry.id, {
          fileEntryId: entry.id,
          mediaType: entry.mediaType,
          name: entry.filename,
          size: entry.size,
        });
      }

      return facts;
    },
  };
}

export function createTurnResourceLedger(
  inputFiles: ReadonlyMap<string, ManagedFileFact>,
  history: readonly AgentMessageView[],
): TurnResourceLedger {
  const fileEntryIds = new Set<string>(inputFiles.keys());

  for (const message of history) {
    for (const part of message.parts) {
      if (part.type !== 'file') {
        continue;
      }
      const parsed = FileEntryIdSchema.safeParse(part.fileEntryId);
      if (parsed.success) {
        fileEntryIds.add(parsed.data);
      }
    }
  }

  return { fileEntryIds, inputFiles };
}

export const managedFileResolver = createManagedFileResolver(fileEntryService, getInternalFileUri);
