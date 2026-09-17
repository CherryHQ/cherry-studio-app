import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { prepareFileExport } from '@/frontend/appShell/imageExport';
import type { ExportSignature } from '@/shared/contracts/documentExport';
import type { ResolvedFile } from '@/shared/contracts/file';

/** Exported bytes are disposable copies; the managed files remain authoritative. */
export async function shareFiles(
  files: readonly ResolvedFile[],
  signature: ExportSignature,
  signal?: AbortSignal,
): Promise<void> {
  if (!files.length) throw new Error('No files to share');
  const urls: string[] = [];
  const mediaTypes: string[] = [];
  let filename = '';
  for (const file of files) {
    signal?.throwIfAborted();
    const prepared = await prepareFileExport(file, signature);
    try {
      signal?.throwIfAborted();
      const directory = new Directory(
        Paths.cache,
        'FileExports',
        file.entry.id,
        prepared.uri === file.uri ? String(file.entry.updatedAt) : randomUUID(),
      );
      directory.create({ idempotent: true, intermediates: true });
      const exported = new File(directory, prepared.filename);
      if (!exported.exists) await new File(prepared.uri).copy(exported, { overwrite: true });
      urls.push(exported.uri);
      mediaTypes.push(prepared.mediaType.split(';')[0].trim().toLowerCase());
      filename = prepared.filename;
    } finally {
      prepared.release();
    }
  }
  signal?.throwIfAborted();
  // The receiving app may read after the chooser resolves. Leave these copies in OS-managed cache.
  if (files.length === 1) {
    await Sharing.shareAsync(urls[0], {
      dialogTitle: filename,
      mimeType: mediaTypes[0],
    });
  } else {
    // Load the native multi-file capability only when needed; ordinary single-file shares keep their existing path.
    const { default: Share } = await import('react-native-share');
    signal?.throwIfAborted();
    await Share.open({
      urls,
      type: mediaTypes.every((type) => type === mediaTypes[0]) ? mediaTypes[0] : '*/*',
      failOnCancel: false,
      useInternalStorage: true,
    });
  }
}

export async function shareFile(file: ResolvedFile, signature: ExportSignature): Promise<void> {
  return shareFiles([file], signature);
}
