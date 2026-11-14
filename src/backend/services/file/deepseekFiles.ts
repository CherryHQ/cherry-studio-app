import { Directory, File, Paths } from 'expo-file-system';
import * as z from 'zod';

import { createHttpClient, isHttpError } from '@/backend/services/http';
import {
  DeepseekServiceError,
  type DeepseekConnection,
} from '@/backend/services/providers/deepseekConnection';
import { deepseekUpload, requestDeepseekJson } from '@/backend/services/providers/deepseekHttp';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { FileEntryIdSchema } from '@/shared/data/types/file';
import { documentFileTypeFromMediaType } from '@/shared/utils/documentFileTypes';
import { sha256HexOfText } from '@/shared/utils/sha256';

import { fileContent } from './fileContent';
import { hashLocalFile } from './fileHash';

const remoteSchema = z.object({
  id: z.string().regex(/^file-[\w-]+$/),
  expires_at: z.number().positive().optional(),
});
const cacheSchema = z.object({ id: remoteSchema.shape.id, expiresAt: z.number().positive() });
const FILE_TTL_SECONDS = 24 * 60 * 60;
const logger = loggerService.withContext('DeepseekFiles');

export function isDeepseekDocument(mediaType: string): boolean {
  const type = documentFileTypeFromMediaType(mediaType);
  return (
    type !== undefined &&
    ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xlsx', 'xls', 'epub'].includes(type)
  );
}

/** Only the Pi adapter passes references prepared from the Host's granted attachment facts. */
export async function uploadDeepseekDocument(
  connection: DeepseekConnection,
  input: { fileEntryId: string; revision?: number; mediaType: string },
  signal: AbortSignal,
): Promise<string> {
  const id = FileEntryIdSchema.parse(input.fileEntryId);
  const source = await fileContent.resolve(id);
  signal.throwIfAborted();
  if (
    !source ||
    source.entry.mediaType !== input.mediaType ||
    (input.revision !== undefined && source.entry.updatedAt !== input.revision)
  )
    throw new DeepseekServiceError('failed');
  if (!isDeepseekDocument(input.mediaType)) throw new DeepseekServiceError('invalid-response');
  const type = documentFileTypeFromMediaType(input.mediaType);
  const purpose =
    type === 'xlsx' || type === 'xls' || type === 'epub' ? 'user_data' : 'rich_layout_recognition';
  const maxBytes = purpose === 'user_data' ? 32 * 1024 * 1024 : 100 * 1024 * 1024;
  if (source.entry.size > maxBytes || new File(source.uri).size > maxBytes)
    throw new DeepseekServiceError('limit');
  const hash = await hashLocalFile(source.uri, signal);
  const requireUnchangedSource = async () => {
    const current = await fileContent.resolve(id);
    if (
      !current ||
      current.entry.updatedAt !== source.entry.updatedAt ||
      (await hashLocalFile(current.uri, signal)) !== hash
    )
      throw new DeepseekServiceError('failed');
    signal.throwIfAborted();
  };
  const directory = new Directory(Paths.cache, 'DeepseekFiles');
  const cache = new File(
    directory,
    `${id}.${sha256HexOfText(`${connection.scope}\n${hash}\n${purpose}`)}.json`,
  );
  let saved: z.infer<typeof cacheSchema> | undefined;
  try {
    if (cache.exists && cache.size < 4096)
      saved = cacheSchema.parse(JSON.parse(await cache.text()));
  } catch {
    // A missing or interrupted derived mapping is rebuilt from the managed original.
  }
  const api = createHttpClient({ baseUrl: connection.baseUrl, timeoutMs: 30_000 });
  if (saved && saved.expiresAt > Date.now() + 60_000) {
    try {
      const response = await api.request<unknown>({
        method: 'GET',
        path: `/files/${saved.id}`,
        headers: connection.headers,
        signal,
        redirect: 'error',
        maxResponseBytes: 64 * 1024,
      });
      const remote = remoteSchema.parse(response.data);
      if (
        remote.id === saved.id &&
        (remote.expires_at === undefined || remote.expires_at * 1000 > Date.now() + 60_000)
      ) {
        await requireUnchangedSource();
        return saved.id;
      }
    } catch (error) {
      signal.throwIfAborted();
      if (!isHttpError(error) || error.status !== 404) throw error;
    }
  }
  const snapshot = await fileContent.prepareUploadSource(id);
  try {
    signal.throwIfAborted();
    const file = new File(snapshot.uri);
    if (file.size > maxBytes) throw new DeepseekServiceError('limit');
    if ((await hashLocalFile(snapshot.uri, signal)) !== hash)
      throw new DeepseekServiceError('failed');
    const uploaded = await requestDeepseekJson(
      connection,
      '/files',
      deepseekUpload(file, purpose, FILE_TTL_SECONDS),
      remoteSchema,
      signal,
      300_000,
    );
    await requireUnchangedSource();
    try {
      directory.create({ intermediates: true, idempotent: true });
      cache.writeSync(
        JSON.stringify({
          id: uploaded.id,
          expiresAt:
            (uploaded.expires_at ?? Math.floor(Date.now() / 1000) + FILE_TTL_SECONDS) * 1000,
        }),
      );
      const mappings = directory
        .list()
        .filter((entry): entry is File => entry instanceof File)
        .sort((a, b) => (b.modificationTime ?? 0) - (a.modificationTime ?? 0));
      for (const extra of mappings.slice(256)) extra.delete();
    } catch {
      // Remote files expire server-side; a local cache miss does not invalidate this upload.
    }
    return uploaded.id;
  } finally {
    if (snapshot.entry.id !== id) {
      try {
        await fileContent.delete(snapshot.entry.id);
      } catch {
        logger.warn('Temporary document snapshot cleanup failed');
      }
    }
  }
}
