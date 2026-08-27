import { fileEntryService } from '@/backend/data/services/FileEntryService';
import {
  getInternalFileUri,
  imageUriToDataUrl,
  readFileUriBytes,
} from '@/backend/services/file/fileStorage';
import type { FileEntry, FileEntryId } from '@/shared/data/types/file';
import { FileEntryIdSchema } from '@/shared/data/types/file';

export type ManagedFileFact = {
  fileEntryId: FileEntryId;
  mediaType: string;
  name: string;
  size: number;
};

export type TurnResourceLedger = {
  /** Managed ids explicitly referenced by the current input or Session transcript. */
  fileEntryIds: ReadonlySet<string>;
  /** Current input facts validated before the message reservation. */
  inputFiles: ReadonlyMap<string, ManagedFileFact>;
  /** Current and historical facts whose row and managed blob passed preflight. */
  availableFiles: ReadonlyMap<string, ManagedFileFact>;
  /**
   * Monotonic Host-side grant: an artifact produced during this turn joins the
   * ledger so the model may reference it later in the same turn. Only the Host
   * or its catalog wrapper calls this with validated ids; tools never widen
   * their own scope.
   */
  grantFile(fileEntryId: FileEntryId): void;
};

/** The slice of the turn ledger a tool may consult: membership, not content. */
export type TurnFileScope = Pick<TurnResourceLedger, 'fileEntryIds'>;

/** Host-owned catalog capability: tools can consult membership; the wrapper grants outputs. */
export type TurnToolResources = Pick<TurnResourceLedger, 'fileEntryIds' | 'grantFile'>;

/** Host-only managed-file boundary. It never exposes a device path to Pi. */
export interface ManagedFileResolver {
  resolveAvailable(
    fileEntryIds: readonly FileEntryId[],
  ): Promise<ReadonlyMap<string, ManagedFileFact>>;
  readAsBytes(file: ManagedFileFact, signal: AbortSignal): Promise<Uint8Array | undefined>;
  readAsDataUrl(file: ManagedFileFact, signal: AbortSignal): Promise<string | undefined>;
}

type AvailableFileEntries = {
  findAvailableByIds(ids: readonly FileEntryId[]): Promise<FileEntry[]>;
};

export function createManagedFileResolver(
  entries: AvailableFileEntries,
  getUri: (entry: Pick<FileEntry, 'filename' | 'id'>) => string | undefined,
  readDataUrl: (uri: string, mediaType: string, signal: AbortSignal) => Promise<string>,
  readBytes: (uri: string, signal: AbortSignal) => Promise<Uint8Array>,
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
    async readAsDataUrl(file, signal) {
      throwIfAborted(signal);
      const uri = getUri({ filename: file.name, id: file.fileEntryId });
      if (!uri) {
        return undefined;
      }
      try {
        const dataUrl = await rejectOnAbort(readDataUrl(uri, file.mediaType, signal), signal);
        throwIfAborted(signal);
        return dataUrl;
      } catch {
        if (signal.aborted) {
          throw signal.reason ?? new Error('Managed image read was aborted.');
        }
        throw new Error('Managed image content could not be read.');
      }
    },
    async readAsBytes(file, signal) {
      throwIfAborted(signal);
      const uri = getUri({ filename: file.name, id: file.fileEntryId });
      if (!uri) {
        return undefined;
      }
      try {
        const bytes = await rejectOnAbort(readBytes(uri, signal), signal);
        throwIfAborted(signal);
        return bytes;
      } catch {
        if (signal.aborted) {
          throw signal.reason ?? new Error('Managed text read was aborted.');
        }
        throw new Error('Managed text content could not be read.');
      }
    },
  };
}

export function createTurnResourceLedger(
  inputFiles: ReadonlyMap<string, ManagedFileFact>,
  authorizedFileEntryIds: readonly string[],
  availableFiles: ReadonlyMap<string, ManagedFileFact> = inputFiles,
): TurnResourceLedger {
  const fileEntryIds = new Set<string>(inputFiles.keys());

  for (const fileEntryId of authorizedFileEntryIds) {
    const parsed = FileEntryIdSchema.safeParse(fileEntryId);
    if (parsed.success) {
      fileEntryIds.add(parsed.data);
    }
  }

  return {
    availableFiles,
    fileEntryIds,
    inputFiles,
    grantFile(fileEntryId) {
      fileEntryIds.add(fileEntryId);
    },
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? new Error('Managed file read was aborted.');
  }
}

function rejectOnAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new Error('Managed file read was aborted.'));
    signal.addEventListener('abort', onAbort, { once: true });
    void operation.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

export const managedFileResolver = createManagedFileResolver(
  fileEntryService,
  getInternalFileUri,
  imageUriToDataUrl,
  readFileUriBytes,
);
