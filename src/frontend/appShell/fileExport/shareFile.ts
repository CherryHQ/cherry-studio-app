import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { ResolvedFile } from '@/shared/contracts/file';
import type { ExportWatermark } from '@/shared/contracts/fileExport';

import { prepareFileExport } from './prepareImageExport';

export class FileSharingError extends Error {
  readonly code = 'unavailable';
  constructor() {
    super('System file sharing is unavailable');
    this.name = 'FileSharingError';
  }
}

/** Exported bytes are disposable copies; the managed files remain authoritative. */
export async function shareFiles(
  source: readonly ResolvedFile[] | (() => Promise<readonly ResolvedFile[]>),
  options: { watermark: ExportWatermark; signal?: AbortSignal },
): Promise<void> {
  const { signal, watermark } = options;
  signal?.throwIfAborted();
  const available = await Sharing.isAvailableAsync();
  signal?.throwIfAborted();
  if (!available) throw new FileSharingError();
  // Capability admission happens before a caller generates or persists a new export.
  const files = typeof source === 'function' ? await source() : source;
  signal?.throwIfAborted();
  if (!files.length) throw new Error('No files to share');
  const urls: string[] = [];
  const mediaTypes: string[] = [];
  let filename = '';
  for (const file of files) {
    signal?.throwIfAborted();
    const prepared = await prepareFileExport(file, watermark);
    try {
      signal?.throwIfAborted();
      const directory = new Directory(
        Paths.cache,
        'FileExports',
        file.entry.id,
        prepared.uri === file.uri ? String(file.entry.updatedAt) : randomUUID(),
      );
      const exported = new File(directory, prepared.filename);
      directory.create({ idempotent: true, intermediates: true });
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native loading shared by Metro and CommonJS tests
    const { default: Share } = require('react-native-share') as typeof import('react-native-share');
    signal?.throwIfAborted();
    await Share.open({
      urls,
      type: mediaTypes.every((type) => type === mediaTypes[0]) ? mediaTypes[0] : '*/*',
      failOnCancel: false,
      useInternalStorage: true,
    });
  }
}

export async function shareFile(
  source: ResolvedFile | (() => Promise<ResolvedFile>),
  options: { watermark: ExportWatermark; signal?: AbortSignal },
): Promise<void> {
  return shareFiles(async () => [typeof source === 'function' ? await source() : source], options);
}
