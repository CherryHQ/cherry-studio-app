import { agentUploadLimits, type ContentRef } from '@cherrystudio/remote-protocol/agent';
import { sha256 } from '@noble/hashes/sha2.js';
import { toByteArray } from 'base64-js';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { RemoteAgentError } from './RemoteAgentError';
import { integrity, type AgentRequest } from './remoteContent';
import { RemoteReadCoordinator, type TransferState } from './RemoteReadCoordinator';

const downloadChunkBytes = 24_576;
const downloadWindow = 8;

export const activeTransfers = new Set<string>();

export type DownloadProgressCallback = (transferred: number, total: number) => void;

type DownloadTransferOptions = {
  sessionId: string;
  cacheKey: string;
  name: string;
  size: number;
  expectedRevision: string;
  expectedSha256: string;
  expectedId: string;
  readChunk: (
    offset: number,
    maxBytes: number,
    signal: AbortSignal,
  ) => Promise<{
    id: string;
    revision: string;
    offset: string;
    nextOffset: string;
    eof: boolean;
    dataBase64: string;
    sha256: string;
  }>;
  signal: AbortSignal;
  onProgress?: DownloadProgressCallback;
};

async function downloadTransferStream({
  sessionId: _sessionId,
  cacheKey,
  name,
  size,
  expectedRevision,
  expectedSha256,
  expectedId,
  readChunk,
  signal,
  onProgress,
}: DownloadTransferOptions): Promise<string> {
  signal.throwIfAborted();
  activeTransfers.add(cacheKey);
  try {
    const directory = new Directory(Paths.cache, 'RemoteAttachments', cacheKey);
    directory.create({ intermediates: true, idempotent: true });
    const cleanFilename = name
      .replace(/[\\/:*?"<>|]/g, '_')
      .split('')
      .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
      .join('');
    const filename =
      !cleanFilename || cleanFilename === '.' || cleanFilename === '..'
        ? 'attachment'
        : cleanFilename;
    const file = new File(directory, filename);
    if (file.exists && file.size === size) {
      onProgress?.(size, size);
      return file.uri;
    }

    const partial = new File(directory, `${filename}.part`);
    let offset = 0;
    if (partial.exists) {
      let existingSize = 0;
      try {
        existingSize = partial.size;
      } catch {
        existingSize = 0;
      }
      if (existingSize > size) {
        try {
          partial.delete();
        } catch {}
        partial.create();
      } else {
        offset = Math.floor(existingSize / downloadChunkBytes) * downloadChunkBytes;
      }
    } else {
      partial.create();
    }

    let handle: ReturnType<File['open']> | undefined;
    let complete = false;
    let corruptState = false;
    try {
      handle = partial.open();
      let hash = sha256.create();
      if (offset > 0) {
        let hashed = 0;
        let readSuccess = true;
        while (hashed < offset) {
          const toRead = Math.min(downloadChunkBytes, offset - hashed);
          try {
            const chunk = handle.readBytesSync(toRead);
            if (!chunk || chunk.length === 0) {
              readSuccess = false;
              break;
            }
            hash.update(chunk);
            hashed += chunk.length;
          } catch {
            readSuccess = false;
            break;
          }
        }
        if (!readSuccess || hashed !== offset) {
          handle.close();
          handle = undefined;
          try {
            if (partial.exists) partial.delete();
          } catch {}
          partial.create();
          handle = partial.open();
          hash = sha256.create();
          offset = 0;
        } else {
          if ('offset' in handle && typeof (handle as any).offset === 'number') {
            (handle as any).offset = offset;
          }
        }
      }
      onProgress?.(offset, size);

      if (size === 0) {
        complete = true;
      }

      while (offset < size) {
        signal.throwIfAborted();
        const startedAt = Date.now();
        const offsets = Array.from(
          {
            length: Math.min(
              downloadWindow,
              Math.max(1, Math.ceil((size - offset) / downloadChunkBytes)),
            ),
          },
          (_, index) => offset + index * downloadChunkBytes,
        );
        const pages = await Promise.allSettled(
          offsets.map((start) => readChunk(start, downloadChunkBytes, signal)),
        );
        for (const result of pages) {
          if (result.status === 'rejected') {
            const err = result.reason;
            const isRevisionExpired =
              err?.code === 'REVISION_EXPIRED' ||
              err?.reason === 'REVISION_EXPIRED' ||
              (typeof err?.message === 'string' && err.message.includes('REVISION_EXPIRED'));
            if (isRevisionExpired) {
              corruptState = true;
              throw new RemoteAgentError('REVISION_EXPIRED');
            }
            if (err instanceof RemoteAgentError && err.code === 'PROTOCOL_ERROR') {
              corruptState = true;
            }
            throw err;
          }
          const page = result.value;
          const chunk = toByteArray(page.dataBase64);
          if (
            page.id !== expectedId ||
            page.revision !== expectedRevision ||
            page.offset !== String(offset) ||
            page.sha256 !== expectedSha256 ||
            chunk.length !== Math.min(downloadChunkBytes, size - offset) ||
            page.nextOffset !== String(offset + chunk.length) ||
            page.eof !== (offset + chunk.length === size)
          ) {
            corruptState = true;
            throw new RemoteAgentError('PROTOCOL_ERROR');
          }
          handle.writeBytesSync(chunk);
          hash.update(chunk);
          offset += chunk.length;
          onProgress?.(offset, size);
        }
        await new Promise<void>((resolve) =>
          setTimeout(resolve, Math.max(0, 32 - (Date.now() - startedAt))),
        );
      }
      if (size > 0) {
        const digest = Array.from(hash.digest(), (byte) => byte.toString(16).padStart(2, '0')).join(
          '',
        );
        if (digest !== expectedSha256) {
          corruptState = true;
          throw new RemoteAgentError('PROTOCOL_ERROR');
        }
      }
      signal.throwIfAborted();
      complete = true;
    } finally {
      handle?.close();
      if (corruptState && partial.exists) {
        try {
          partial.delete();
        } catch {}
      }
    }
    try {
      if (file.exists) file.delete();
      partial.moveSync(file);
      onProgress?.(size, size);
      return file.uri;
    } finally {
      if (partial.uri !== file.uri && partial.exists) {
        try {
          partial.delete();
        } catch {}
      }
    }
  } finally {
    activeTransfers.delete(cacheKey);
  }
}

/** The scope owns in-flight work; completed, verified bytes survive in the OS cache. */
export function createAttachmentDownloader() {
  const reads = new RemoteReadCoordinator();
  const downloader = (
    binding: string,
    request: AgentRequest,
    sessionId: string,
    ref: ContentRef,
    name: string,
    signal: AbortSignal,
    onProgress?: DownloadProgressCallback,
  ): Promise<string> => {
    const key = integrity.sha256(
      new TextEncoder().encode(
        JSON.stringify([
          binding,
          sessionId,
          ref.contentId,
          ref.revision,
          ref.sha256,
          ref.byteLength,
          name,
        ]),
      ),
    );
    const totalBytes = Number(ref.byteLength) || 0;
    reads.updateTransferState(key, {
      transferId: key,
      state: 'downloading',
      transferredBytes: 0,
      totalBytes,
      progress: 0,
    });
    return reads.share(key, signal, (sharedSignal) =>
      downloadAttachment(request, sessionId, ref, name, sharedSignal, key, (transferred, total) => {
        reads.updateTransferState(key, {
          transferredBytes: transferred,
          totalBytes: total,
          state: transferred === total ? 'verifying' : 'downloading',
        });
        onProgress?.(transferred, total);
      })
        .then((uri) => {
          reads.updateTransferState(key, {
            state: 'completed',
            transferredBytes: totalBytes,
            progress: 1,
          });
          return uri;
        })
        .catch((err) => {
          reads.updateTransferState(key, {
            state: sharedSignal.aborted ? 'paused' : 'failed',
          });
          throw err;
        }),
    );
  };
  return Object.assign(downloader, { coordinator: reads });
}

/** Downloads only when opened; the native file handle keeps JS memory bounded. */
export async function downloadAttachment(
  request: AgentRequest,
  sessionId: string,
  ref: ContentRef,
  name: string,
  signal: AbortSignal,
  cacheKey = randomUUID(),
  onProgress?: DownloadProgressCallback,
): Promise<string> {
  const size = Number(ref.byteLength);
  if (!Number.isSafeInteger(size) || size < 0 || size > agentUploadLimits.fileBytes)
    throw new RemoteAgentError('RESOURCE_UNAVAILABLE');
  return downloadTransferStream({
    sessionId,
    cacheKey,
    name,
    size,
    expectedRevision: ref.revision,
    expectedSha256: ref.sha256,
    expectedId: ref.contentId,
    readChunk: async (offset, maxBytes, sig) => {
      const page = await request(
        'agent.content.read',
        {
          sessionId,
          contentId: ref.contentId,
          revision: ref.revision,
          offset: String(offset),
          maxBytes,
        },
        sig,
      );
      return {
        id: page.contentId,
        revision: page.revision,
        offset: page.offset,
        nextOffset: page.nextOffset,
        eof: page.eof,
        dataBase64: page.dataBase64,
        sha256: page.sha256,
      };
    },
    signal,
    onProgress,
  });
}

export type WorkspaceFileDownloadRef = {
  path: string;
  revision: string;
  sha256: string;
  byteLength: string | number;
  name?: string;
};

/** Workspace file downloader; keyed by (binding, sessionId, path, revision, sha256). */
export function createWorkspaceFileDownloader() {
  const reads = new RemoteReadCoordinator();
  const downloader = (
    binding: string,
    request: AgentRequest,
    sessionId: string,
    file: WorkspaceFileDownloadRef,
    signal: AbortSignal,
    onProgress?: DownloadProgressCallback,
  ): Promise<string> => {
    const filename = file.name || file.path.split(/[/\\]/).pop() || 'file';
    const key = integrity.sha256(
      new TextEncoder().encode(
        JSON.stringify([
          binding,
          sessionId,
          file.path,
          file.revision,
          file.sha256,
          String(file.byteLength),
          filename,
        ]),
      ),
    );
    const totalBytes = Number(file.byteLength) || 0;
    reads.updateTransferState(key, {
      transferId: key,
      state: 'downloading',
      transferredBytes: 0,
      totalBytes,
      progress: 0,
    });
    return reads.share(key, signal, (sharedSignal) =>
      downloadWorkspaceFile(request, sessionId, file, sharedSignal, key, (transferred, total) => {
        reads.updateTransferState(key, {
          transferredBytes: transferred,
          totalBytes: total,
          state: transferred === total ? 'verifying' : 'downloading',
        });
        onProgress?.(transferred, total);
      })
        .then((uri) => {
          reads.updateTransferState(key, {
            state: 'completed',
            transferredBytes: totalBytes,
            progress: 1,
          });
          return uri;
        })
        .catch((err) => {
          reads.updateTransferState(key, {
            state: sharedSignal.aborted ? 'paused' : 'failed',
          });
          throw err;
        }),
    );
  };
  return Object.assign(downloader, { coordinator: reads });
}

export async function downloadWorkspaceFile(
  request: AgentRequest,
  sessionId: string,
  file: WorkspaceFileDownloadRef,
  signal: AbortSignal,
  cacheKey = randomUUID(),
  onProgress?: DownloadProgressCallback,
): Promise<string> {
  const size = Number(file.byteLength);
  if (!Number.isSafeInteger(size) || size < 0 || size > agentUploadLimits.fileBytes)
    throw new RemoteAgentError('RESOURCE_UNAVAILABLE');
  const filename = file.name || file.path.split(/[/\\]/).pop() || 'file';
  return downloadTransferStream({
    sessionId,
    cacheKey,
    name: filename,
    size,
    expectedRevision: file.revision,
    expectedSha256: file.sha256,
    expectedId: file.path,
    readChunk: async (offset, maxBytes, sig) => {
      const page = (await (request as any)(
        'agent.files.read',
        {
          sessionId,
          path: file.path,
          expectedRevision: file.revision,
          offset: String(offset),
          maxBytes,
        },
        sig,
      )) as {
        path: string;
        revision: string;
        offset: string;
        nextOffset: string;
        eof: boolean;
        dataBase64: string;
        sha256: string;
      };
      return {
        id: page.path,
        revision: page.revision,
        offset: page.offset,
        nextOffset: page.nextOffset,
        eof: page.eof,
        dataBase64: page.dataBase64,
        sha256: page.sha256,
      };
    },
    signal,
    onProgress,
  });
}

export function getRemoteAttachmentCacheSize(): number {
  const root = new Directory(Paths.cache, 'RemoteAttachments');
  if (!root.exists) return 0;
  let totalBytes = 0;
  try {
    const entries = root.list();
    for (const entry of entries) {
      if (entry instanceof Directory) {
        try {
          const files = entry.list();
          for (const file of files) {
            if (file instanceof File && file.exists) {
              totalBytes += file.size;
            }
          }
        } catch {}
      } else if (entry instanceof File && entry.exists) {
        totalBytes += entry.size;
      }
    }
  } catch {}
  return totalBytes;
}

export function clearRemoteAttachmentCache(protectedKeys?: Set<string>): number {
  const root = new Directory(Paths.cache, 'RemoteAttachments');
  if (!root.exists) return 0;
  let clearedBytes = 0;
  try {
    const entries = root.list();
    for (const entry of entries) {
      if (entry instanceof Directory) {
        if (activeTransfers.has(entry.name) || (protectedKeys && protectedKeys.has(entry.name))) {
          continue;
        }
        try {
          const files = entry.list();
          for (const file of files) {
            if (file instanceof File && file.exists) {
              clearedBytes += file.size;
            }
          }
          entry.delete();
        } catch {}
      } else if (entry instanceof File && entry.exists) {
        try {
          clearedBytes += entry.size;
          entry.delete();
        } catch {}
      }
    }
  } catch {}
  return clearedBytes;
}

export function pruneRemoteAttachmentCache(options?: {
  maxBytes?: number;
  targetBytes?: number;
  protectedKeys?: Set<string>;
}): number {
  const maxBytes = options?.maxBytes ?? 512 * 1024 * 1024;
  const targetBytes = options?.targetBytes ?? 384 * 1024 * 1024;
  const protectedKeys = options?.protectedKeys;

  const root = new Directory(Paths.cache, 'RemoteAttachments');
  if (!root.exists) return 0;

  let totalSize = 0;
  let prunedBytes = 0;
  const entries: Array<{ dir: Directory; name: string; size: number }> = [];

  try {
    const subdirs = root.list();
    for (const subdir of subdirs) {
      if (!(subdir instanceof Directory)) continue;
      let dirSize = 0;
      try {
        const files = subdir.list();
        for (const file of files) {
          if (file instanceof File && file.exists) {
            dirSize += file.size;
          }
        }
      } catch {}
      totalSize += dirSize;
      entries.push({ dir: subdir, name: subdir.name, size: dirSize });
    }

    if (totalSize > maxBytes) {
      for (const entry of entries) {
        if (totalSize <= targetBytes) break;
        if (activeTransfers.has(entry.name) || (protectedKeys && protectedKeys.has(entry.name))) {
          continue;
        }
        try {
          entry.dir.delete();
          totalSize -= entry.size;
          prunedBytes += entry.size;
        } catch {}
      }
    }
  } catch {}
  return prunedBytes;
}

export class RemoteAttachmentCacheManager {
  getSize = getRemoteAttachmentCacheSize;
  clear = clearRemoteAttachmentCache;
  prune = pruneRemoteAttachmentCache;
}

export const remoteAttachmentCache = new RemoteAttachmentCacheManager();
