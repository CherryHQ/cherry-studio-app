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

/** Exported bytes are disposable copies; the managed file remains authoritative. */
export async function shareFile(
  source: ResolvedFile | (() => Promise<ResolvedFile>),
  options: { watermark: ExportWatermark; signal?: AbortSignal },
): Promise<void> {
  const { signal, watermark } = options;
  signal?.throwIfAborted();
  const available = await Sharing.isAvailableAsync();
  signal?.throwIfAborted();
  if (!available) throw new FileSharingError();
  // Capability admission happens before a caller generates or persists a new export.
  const file = typeof source === 'function' ? await source() : source;
  signal?.throwIfAborted();
  const { entry } = file;
  const prepared = await prepareFileExport(file, watermark);
  let exported: File;
  try {
    signal?.throwIfAborted();
    const directory = new Directory(
      Paths.cache,
      'FileExports',
      entry.id,
      prepared.uri === file.uri ? String(entry.updatedAt) : randomUUID(),
    );
    exported = new File(directory, prepared.filename);
    directory.create({ idempotent: true, intermediates: true });
    if (!exported.exists) await new File(prepared.uri).copy(exported, { overwrite: true });
  } finally {
    prepared.release();
  }
  signal?.throwIfAborted();

  // Android's promise settles when a recipient is chosen, before it necessarily
  // reads the file. Keep the copy in the OS-managed cache after the sheet closes.
  await Sharing.shareAsync(exported.uri, {
    dialogTitle: prepared.filename,
    mimeType: prepared.mediaType.split(';')[0].trim().toLowerCase(),
  });
}
