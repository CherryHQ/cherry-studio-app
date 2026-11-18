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
// Each model request of a turn, including tool steps, replays every attached document. A recently
// confirmed reference for the same source revision skips rehashing and the remote check.
const CONFIRMED_REUSE_MS = 10 * 60_000;
const MAX_CONFIRMED = 256;
const confirmed = new Map<string, { fileId: string; expiresAt: number; confirmedAt: number }>();

function confirm(key: string, fileId: string, expiresAt: number): string {
  confirmed.delete(key);
  confirmed.set(key, { fileId, expiresAt, confirmedAt: Date.now() });
  if (confirmed.size > MAX_CONFIRMED) confirmed.delete(confirmed.keys().next().value!);
  return fileId;
}
const logger = loggerService.withContext('DeepseekFiles');

export class DeepseekDocumentUnavailableError extends Error {
  constructor() {
    super('The attached document version is unavailable. Attach its current version again.');
    this.name = 'DeepseekDocumentUnavailableError';
  }
}

export function isDeepseekDocument(mediaType: string): boolean {
  const type = documentFileTypeFromMediaType(mediaType);
  return (
    type !== undefined &&
    ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xlsx', 'xls', 'epub'].includes(type)
  );
}

async function hashDocumentSource(uri: string, signal: AbortSignal): Promise<string> {
  try {
    return await hashLocalFile(uri, signal);
  } catch (error) {
    signal.throwIfAborted();
    if (!new File(uri).exists) throw new DeepseekDocumentUnavailableError();
    throw error;
  }
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
    throw new DeepseekDocumentUnavailableError();
  if (!isDeepseekDocument(input.mediaType)) throw new DeepseekServiceError('invalid-response');
  const type = documentFileTypeFromMediaType(input.mediaType);
  const purpose =
    type === 'xlsx' || type === 'xls' || type === 'epub' ? 'user_data' : 'rich_layout_recognition';
  const maxBytes = purpose === 'user_data' ? 32 * 1024 * 1024 : 100 * 1024 * 1024;
  if (source.entry.size > maxBytes || new File(source.uri).size > maxBytes)
    throw new DeepseekServiceError('limit');
  const confirmedKey = JSON.stringify([connection.scope, id, source.entry.updatedAt, purpose]);
  const recent = confirmed.get(confirmedKey);
  if (
    recent &&
    Date.now() - recent.confirmedAt < CONFIRMED_REUSE_MS &&
    recent.expiresAt > Date.now() + 60_000
  )
    return recent.fileId;
  const hash = await hashDocumentSource(source.uri, signal);
  const requireUnchangedSource = async () => {
    const current = await fileContent.resolve(id);
    signal.throwIfAborted();
    if (
      !current ||
      current.entry.updatedAt !== source.entry.updatedAt ||
      (await hashDocumentSource(current.uri, signal)) !== hash
    )
      throw new DeepseekDocumentUnavailableError();
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
        return confirm(
          confirmedKey,
          saved.id,
          remote.expires_at === undefined ? saved.expiresAt : remote.expires_at * 1000,
        );
      }
    } catch (error) {
      signal.throwIfAborted();
      if (!isHttpError(error) || error.status !== 404) throw error;
    }
  }
  const snapshot = await fileContent.prepareUploadSource(id).catch(async (error) => {
    signal.throwIfAborted();
    await requireUnchangedSource();
    throw error;
  });
  try {
    signal.throwIfAborted();
    const file = new File(snapshot.uri);
    if (file.size > maxBytes) throw new DeepseekServiceError('limit');
    const snapshotHash = await hashLocalFile(snapshot.uri, signal).catch(async (error) => {
      await requireUnchangedSource();
      throw error;
    });
    if (snapshotHash !== hash) {
      await requireUnchangedSource();
      throw new DeepseekServiceError('failed');
    }
    const uploaded = await requestDeepseekJson(
      connection,
      '/files',
      deepseekUpload(file, purpose, FILE_TTL_SECONDS),
      remoteSchema,
      signal,
      300_000,
    );
    await requireUnchangedSource();
    const expiresAt =
      (uploaded.expires_at ?? Math.floor(Date.now() / 1000) + FILE_TTL_SECONDS) * 1000;
    try {
      directory.create({ intermediates: true, idempotent: true });
      cache.writeSync(JSON.stringify({ id: uploaded.id, expiresAt }));
      const mappings = directory
        .list()
        .filter((entry): entry is File => entry instanceof File)
        .sort((a, b) => (b.modificationTime ?? 0) - (a.modificationTime ?? 0));
      for (const extra of mappings.slice(256)) extra.delete();
    } catch {
      // Remote files expire server-side; a local cache miss does not invalidate this upload.
    }
    return confirm(confirmedKey, uploaded.id, expiresAt);
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
