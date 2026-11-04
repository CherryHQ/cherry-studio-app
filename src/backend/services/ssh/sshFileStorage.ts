import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { fileEntryService } from '@/backend/data/services/FileEntryService';
import { createInternalEntryWithPreview } from '@/backend/services/file/filePreviewStorage';
import {
  discardInternalEntries,
  getInternalFileUri,
  resolveFileEntry,
} from '@/backend/services/file/fileStorage';
import type { ResolvedFile } from '@/shared/contracts/file';
import { FileEntryIdSchema, SafeNameSchema } from '@/shared/data/types/file';
import { SshError } from '@/shared/data/types/ssh';

export const SSH_TRANSFER_MAX_BYTES = 20 * 1024 * 1024;

/** Each transfer owns a fresh directory; remote/model paths never become local paths. */
export function createSshStagingFile() {
  const directory = new Directory(Paths.cache, 'SshTransfers', randomUUID());
  directory.create({ intermediates: true });
  const file = new File(directory, 'transfer');
  return {
    file,
    path: decodeURIComponent(new URL(file.uri).pathname),
    dispose() {
      try {
        directory.delete();
      } catch {
        /* Disposable cache, never a managed file. */
      }
    },
  };
}

export async function stageSshUpload(id: string, destination: File, signal: AbortSignal) {
  signal.throwIfAborted();
  const source = await resolveFileEntry(fileEntryService, FileEntryIdSchema.parse(id));
  if (!source) throw new SshError('local-file');
  const file = new File(source.uri);
  if (file.size > SSH_TRANSFER_MAX_BYTES) throw new SshError('file-too-large');
  signal.throwIfAborted();
  file.copy(destination);
  signal.throwIfAborted();
}

export async function importSshDownload(
  uri: string,
  remotePath: string,
  folderId: string | null,
  signal: AbortSignal,
): Promise<ResolvedFile> {
  const name = SafeNameSchema.safeParse(remotePath.split('/').at(-1));
  if (!name.success) throw new SshError('path');
  // Preserve exact remote bytes, including images; this is not a picker normalization.
  const entry = await createInternalEntryWithPreview(
    fileEntryService,
    {
      uri,
      name: name.data,
      folderId,
      provenance: 'imported',
      source: 'uri',
    },
    signal,
  );
  const managedUri = getInternalFileUri(entry);
  if (!managedUri) {
    await discardInternalEntries(fileEntryService, [entry]);
    throw new SshError('local-file');
  }
  return { entry, uri: managedUri };
}
