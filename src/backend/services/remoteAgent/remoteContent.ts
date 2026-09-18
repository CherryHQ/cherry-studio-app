import { randomUUID } from 'expo-crypto';
import { Directory, File, FileMode, Paths } from 'expo-file-system';

import type { FileEntryService } from '@/backend/data/services/FileEntryService';
import { createInternalEntry, getInternalFileUri } from '@/backend/services/file/fileStorage';
import { filenameExtension, readableFilename } from '@/shared/data/types/file';

import { ArtifactSchema, ContentSchema } from './protocol';
import { RemoteAgentError } from './RemoteAgentClient';
import { decodeBase64, utf8 } from './secureChannel';

type Request = (method: string, params: unknown, signal?: AbortSignal) => Promise<unknown>;

/** Complete UTF-8 pages before parsing JSON; retry a changed revision from offset zero once. */
export async function readContent(
  request: Request,
  method: string,
  params: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ text: string; encoding: 'text' | 'json' }> {
  for (let attempt = 0; ; attempt++) {
    let offset = 0;
    let revision: string | undefined;
    let total: number | undefined;
    let encoding: 'text' | 'json' | undefined;
    const chunks: string[] = [];
    try {
      for (;;) {
        signal?.throwIfAborted();
        const page = ContentSchema.parse(
          await request(
            method,
            { ...params, offset, limitBytes: 32768, ...(revision ? { revision } : {}) },
            signal,
          ),
        );
        if (page.totalBytes > 16 * 1024 * 1024) throw new RemoteAgentError('CONTENT_TOO_LARGE');
        const end = offset + utf8(page.text).length;
        if (
          page.offset !== offset ||
          (revision && revision !== page.revision) ||
          (total !== undefined && total !== page.totalBytes) ||
          (encoding && encoding !== page.encoding) ||
          end > page.totalBytes ||
          (page.nextOffset !== null
            ? page.nextOffset !== end || end <= offset
            : end !== page.totalBytes)
        )
          throw new RemoteAgentError('PROTOCOL_ERROR');
        revision = page.revision;
        total = page.totalBytes;
        encoding = page.encoding;
        chunks.push(page.text);
        if (page.nextOffset === null) return { text: chunks.join(''), encoding: page.encoding };
        offset = page.nextOffset;
      }
    } catch (error) {
      if (attempt === 0 && error instanceof RemoteAgentError && error.code === 'CONTENT_CHANGED')
        continue;
      throw error;
    }
  }
}

export async function downloadArtifact(
  request: Request,
  params: Record<string, unknown>,
  files: Pick<FileEntryService, 'create'>,
  signal: AbortSignal,
  progress: (received: number, total: number) => void,
) {
  const directory = new Directory(Paths.cache, 'RemoteAgent', randomUUID());
  directory.create({ intermediates: true });
  const file = new File(directory, 'download');
  let output: ReturnType<File['open']> | undefined;
  try {
    for (let attempt = 0; ; attempt++) {
      let offset = 0;
      let revision: string | undefined;
      let total: number | undefined;
      let metadata: { name: string; mediaType: string } | undefined;
      file.create({ overwrite: true });
      output = file.open(FileMode.WriteOnly);
      try {
        for (;;) {
          signal.throwIfAborted();
          const page = ArtifactSchema.parse(
            await request(
              'artifacts.read',
              { ...params, offset, limitBytes: 262144, ...(revision ? { revision } : {}) },
              signal,
            ),
          );
          signal.throwIfAborted();
          if (page.totalBytes > 256 * 1024 * 1024) throw new RemoteAgentError('CONTENT_TOO_LARGE');
          const bytes = decodeBase64(page.data);
          const end = offset + bytes.length;
          if (
            page.offset !== offset ||
            (revision && revision !== page.revision) ||
            (total !== undefined && total !== page.totalBytes) ||
            end > page.totalBytes ||
            (page.nextOffset !== null
              ? page.nextOffset !== end || end <= offset
              : end !== page.totalBytes)
          )
            throw new RemoteAgentError('PROTOCOL_ERROR');
          revision = page.revision;
          total = page.totalBytes;
          metadata ??= { name: page.name, mediaType: page.mediaType };
          output.writeBytes(bytes);
          progress(end, total);
          if (page.nextOffset === null) break;
          offset = page.nextOffset;
        }
        output.close();
        output = undefined;
        signal.throwIfAborted();
        const extension = filenameExtension(metadata!.name) ?? '';
        const stem = extension ? metadata!.name.slice(0, -(extension.length + 1)) : metadata!.name;
        // Peer bytes must remain exact; the picker import workflow may resize images.
        const entry = await createInternalEntry(
          files,
          {
            source: 'uri',
            provenance: 'unknown',
            uri: file.uri,
            name: readableFilename(stem, { extension, fallback: 'artifact' }),
            mediaType: metadata!.mediaType,
          },
          signal,
        );
        const uri = getInternalFileUri(entry);
        if (!uri) throw new RemoteAgentError('ARTIFACT_UNAVAILABLE');
        return { entry, uri };
      } catch (error) {
        output?.close();
        output = undefined;
        if (attempt === 0 && error instanceof RemoteAgentError && error.code === 'CONTENT_CHANGED')
          continue;
        throw error;
      }
    }
  } finally {
    output?.close();
    if (directory.exists) directory.delete();
  }
}
