import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import type { TemporaryFilePreview } from '@/shared/contracts/file';
import { filenameExtension, MediaTypeSchema, SafeNameSchema } from '@/shared/data/types/file';

/** Retain an independent cache copy before the originating resource owner can retire. */
export async function prepareTemporaryFilePreview(
  source: { uri: string; filename: string; mediaType?: string },
  signal: AbortSignal,
): Promise<TemporaryFilePreview> {
  signal.throwIfAborted();
  const filename = SafeNameSchema.parse(source.filename);
  const id = randomUUID();
  const directory = new Directory(Paths.cache, 'FilePreviews', id);
  const release = () => {
    try {
      directory.delete();
    } catch {
      /* Disposable cache only. */
    }
  };
  try {
    directory.create({ intermediates: true });
    const extension = filenameExtension(filename);
    const suffix = extension && /^[a-z0-9]{1,16}$/.test(extension) ? `.${extension}` : '';
    const file = new File(directory, `preview${suffix}`);
    await new File(source.uri).copy(file);
    signal.throwIfAborted();
    const mediaType = MediaTypeSchema.safeParse(source.mediaType);
    return {
      entry: {
        id,
        filename,
        mediaType: mediaType.success ? mediaType.data : 'application/octet-stream',
        size: file.size,
        updatedAt: Date.now(),
        provenance: 'unknown',
      },
      uri: file.uri,
      release,
    };
  } catch (error) {
    release();
    throw error;
  }
}
