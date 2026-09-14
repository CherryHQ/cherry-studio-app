import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { ResolvedFile } from '@/shared/contracts/file';

import { getFileSharing } from '../../../../../modules/file-sharing';

/** Exported bytes are disposable copies; the managed file remains authoritative. */
export async function shareFile(file: ResolvedFile): Promise<void> {
  await shareFiles([file]);
}

export async function shareFiles(
  files: readonly ResolvedFile[],
  signal?: AbortSignal,
): Promise<void> {
  if (!files.length) throw new Error('No files to share');
  const native = files.length > 1 ? getFileSharing() : null;
  const uris: string[] = [];
  for (const { entry, uri } of files) {
    signal?.throwIfAborted();
    const directory = new Directory(Paths.cache, 'FileExports', entry.id, String(entry.updatedAt));
    directory.create({ idempotent: true, intermediates: true });
    const exported = new File(directory, entry.filename);
    if (!exported.exists) await new File(uri).copy(exported, { overwrite: true });
    uris.push(exported.uri);
  }
  signal?.throwIfAborted();
  const mediaTypes = new Set(
    files.map(({ entry }) => entry.mediaType.split(';')[0].trim().toLowerCase()),
  );
  const mimeType = mediaTypes.size === 1 ? [...mediaTypes][0] : '*/*';
  const title = files[0].entry.filename;

  // Android's promise settles when a recipient is chosen, before it necessarily
  // reads the file. Keep the copy in the OS-managed cache after the sheet closes.
  if (native) await native.shareFiles(uris, mimeType, title);
  else await Sharing.shareAsync(uris[0], { dialogTitle: title, mimeType });
}
