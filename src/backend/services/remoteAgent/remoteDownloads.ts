import { agentUploadLimits, type ContentRef } from '@cherrystudio/remote-protocol/agent';
import { sha256 } from '@noble/hashes/sha2.js';
import { toByteArray } from 'base64-js';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { RemoteAgentError } from './RemoteAgentError';
import type { AgentRequest } from './remoteContent';

/** Downloads only when opened; the native file handle keeps JS memory bounded. */
export async function downloadAttachment(
  request: AgentRequest,
  sessionId: string,
  ref: ContentRef,
  name: string,
  signal: AbortSignal,
): Promise<string> {
  const size = Number(ref.byteLength);
  if (!Number.isSafeInteger(size) || size < 0 || size > agentUploadLimits.fileBytes)
    throw new RemoteAgentError('RESOURCE_UNAVAILABLE');
  signal.throwIfAborted();
  const directory = new Directory(Paths.cache, 'RemoteAttachments', randomUUID());
  directory.create({ intermediates: true });
  const filename = name
    .replace(/[\\/:*?"<>|]/g, '_')
    .split('')
    .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
    .join('');
  const file = new File(
    directory,
    !filename || filename === '.' || filename === '..' ? 'attachment' : filename,
  );
  file.create();
  const handle = file.open();
  let complete = false;
  try {
    const hash = sha256.create();
    let offset = 0;
    do {
      signal.throwIfAborted();
      const startedAt = Date.now();
      const offsets = Array.from(
        {
          length: Math.min(
            agentUploadLimits.window,
            Math.max(1, Math.ceil((size - offset) / agentUploadLimits.chunkBytes)),
          ),
        },
        (_, index) => offset + index * agentUploadLimits.chunkBytes,
      );
      const pages = await Promise.allSettled(
        offsets.map((start) =>
          request(
            'agent.content.read',
            {
              sessionId,
              contentId: ref.contentId,
              revision: ref.revision,
              offset: String(start),
              maxBytes: agentUploadLimits.chunkBytes,
            },
            signal,
          ),
        ),
      );
      for (const result of pages) {
        if (result.status === 'rejected') throw result.reason;
        const page = result.value;
        const chunk = toByteArray(page.dataBase64);
        if (
          page.contentId !== ref.contentId ||
          page.revision !== ref.revision ||
          page.offset !== String(offset) ||
          page.sha256 !== ref.sha256 ||
          chunk.length !== Math.min(agentUploadLimits.chunkBytes, size - offset) ||
          page.nextOffset !== String(offset + chunk.length) ||
          page.eof !== (offset + chunk.length === size)
        )
          throw new RemoteAgentError('PROTOCOL_ERROR');
        handle.writeBytes(chunk);
        hash.update(chunk);
        offset += chunk.length;
      }
      await new Promise<void>((resolve) =>
        setTimeout(resolve, Math.max(0, 32 - (Date.now() - startedAt))),
      );
    } while (offset < size);
    const digest = Array.from(hash.digest(), (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (digest !== ref.sha256) throw new RemoteAgentError('PROTOCOL_ERROR');
    signal.throwIfAborted();
    complete = true;
    return file.uri;
  } finally {
    handle.close();
    if (!complete && directory.exists) directory.delete();
  }
}
