import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { ResolvedFile } from '@/shared/contracts/file';

/** Exported bytes are disposable copies; the managed file remains authoritative. */
export async function shareFile({ entry, uri }: ResolvedFile): Promise<void> {
  const directory = new Directory(Paths.cache, 'FileExports', entry.id, String(entry.updatedAt));
  directory.create({ idempotent: true, intermediates: true });
  const exported = new File(directory, entry.filename);
  if (!exported.exists) await new File(uri).copy(exported, { overwrite: true });

  // Android's promise settles when a recipient is chosen, before it necessarily
  // reads the file. Keep the copy in the OS-managed cache after the sheet closes.
  await Sharing.shareAsync(exported.uri, {
    dialogTitle: entry.filename,
    mimeType: entry.mediaType.split(';')[0].trim().toLowerCase(),
  });
}
