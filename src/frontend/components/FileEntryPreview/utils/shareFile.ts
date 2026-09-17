import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { prepareFileExport } from '@/frontend/appShell/imageExport';
import type { ExportSignature } from '@/shared/contracts/documentExport';
import type { ResolvedFile } from '@/shared/contracts/file';

/** Exported bytes are disposable copies; the managed file remains authoritative. */
export async function shareFile(file: ResolvedFile, signature: ExportSignature): Promise<void> {
  const { entry } = file;
  const prepared = await prepareFileExport(file, signature);
  const directory = new Directory(
    Paths.cache,
    'FileExports',
    entry.id,
    prepared.uri === file.uri ? String(entry.updatedAt) : randomUUID(),
  );
  const exported = new File(directory, prepared.filename);
  try {
    directory.create({ idempotent: true, intermediates: true });
    if (!exported.exists) await new File(prepared.uri).copy(exported, { overwrite: true });
  } finally {
    prepared.release();
  }

  // Android's promise settles when a recipient is chosen, before it necessarily
  // reads the file. Keep the copy in the OS-managed cache after the sheet closes.
  await Sharing.shareAsync(exported.uri, {
    dialogTitle: prepared.filename,
    mimeType: prepared.mediaType.split(';')[0].trim().toLowerCase(),
  });
}
