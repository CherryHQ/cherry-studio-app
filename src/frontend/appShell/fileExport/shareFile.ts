import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { FilePreviewSource } from '@/shared/contracts/file';
import type { ExportFile, ExportWatermark } from '@/shared/contracts/fileExport';
import { sha256HexOfText } from '@/shared/utils/sha256';

import { prepareFileExport } from './prepareImageExport';

export type ShareableFile = FilePreviewSource | ExportFile;

export class FileSharingError extends Error {
  readonly code = 'unavailable';
  constructor() {
    super('System file sharing is unavailable');
    this.name = 'FileSharingError';
  }
}

/** Exported bytes are disposable copies; the managed files remain authoritative. */
export async function shareFiles(
  source: readonly ShareableFile[] | (() => Promise<readonly ShareableFile[]>),
  options: { watermark: ExportWatermark; signal?: AbortSignal },
): Promise<void> {
  const { signal } = options;
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
    const prepared = await prepareSharedFile(file, options);
    urls.push(prepared.uri);
    mediaTypes.push(prepared.mediaType.split(';')[0].trim().toLowerCase());
    filename = prepared.filename;
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
  source: ShareableFile | (() => Promise<ShareableFile>),
  options: { watermark: ExportWatermark; signal?: AbortSignal },
): Promise<void> {
  return shareFiles(async () => [typeof source === 'function' ? await source() : source], options);
}

/** Cache a complete file before an external reader or Photos can outlive its source session. */
export async function prepareSharedFile(
  file: ShareableFile,
  options: { watermark: ExportWatermark; signal?: AbortSignal },
): Promise<ExportFile> {
  const { signal, watermark } = options;
  signal?.throwIfAborted();
  const managed = 'entry' in file;
  const prepared = managed ? await prepareFileExport(file, watermark) : { ...file, release() {} };
  try {
    signal?.throwIfAborted();
    // One path per revision and treatment, so sharing again replaces rather than adds a copy.
    const directory = new Directory(
      Paths.cache,
      'FileExports',
      managed ? file.entry.id : `generated-${sha256HexOfText(file.uri)}`,
      prepared.uri === file.uri
        ? managed
          ? String(file.entry.updatedAt)
          : 'temporary'
        : `${managed ? file.entry.updatedAt : 'temporary'}-${hashWatermark(watermark)}`,
    );
    const exported = new File(directory, prepared.filename);
    directory.create({ idempotent: true, intermediates: true });
    if (!exported.exists) await new File(prepared.uri).copy(exported, { overwrite: true });
    signal?.throwIfAborted();
    return { uri: exported.uri, filename: prepared.filename, mediaType: prepared.mediaType };
  } finally {
    prepared.release();
  }
}

/** FNV-1a over the resolved treatment; it names a cache path and is not a security boundary. */
function hashWatermark(watermark: ExportWatermark): string {
  const json = JSON.stringify(watermark);
  let hash = 0x811c9dc5;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
