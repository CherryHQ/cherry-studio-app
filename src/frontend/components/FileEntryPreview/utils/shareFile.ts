import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { ResolvedFile } from '@/shared/contracts/file';

/** Exported bytes are disposable copies; the managed files remain authoritative. */
export async function shareFiles(
  files: readonly ResolvedFile[],
  signal?: AbortSignal,
): Promise<void> {
  if (!files.length) throw new Error('No files to share');
  const urls: string[] = [];
  for (const { entry, uri } of files) {
    signal?.throwIfAborted();
    const directory = new Directory(Paths.cache, 'FileExports', entry.id, String(entry.updatedAt));
    directory.create({ idempotent: true, intermediates: true });
    const exported = new File(directory, entry.filename);
    if (!exported.exists) await new File(uri).copy(exported, { overwrite: true });
    urls.push(exported.uri);
  }
  signal?.throwIfAborted();
  const mediaTypes = files.map(({ entry }) => entry.mediaType.split(';')[0].trim().toLowerCase());
  // The receiving app may read after the chooser resolves. Leave these copies in OS-managed cache.
  if (files.length === 1) {
    await Sharing.shareAsync(urls[0], {
      dialogTitle: files[0].entry.filename,
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

export async function shareFile(file: ResolvedFile): Promise<void> {
  return shareFiles([file]);
}
