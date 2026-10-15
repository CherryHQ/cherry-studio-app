import type { AgentResult, ContentRef } from '@cherrystudio/remote-protocol/agent';
import { sha256 } from '@noble/hashes/sha2.js';
import { toByteArray } from 'base64-js';

import { RemoteConversationError } from './RemoteConversationError';

export const integrity = {
  sha256: (bytes: Uint8Array) =>
    Array.from(sha256(bytes), (byte) => byte.toString(16).padStart(2, '0')).join(''),
};

export async function readContentBytes(
  ref: ContentRef,
  readChunk: (offset: string, signal?: AbortSignal) => Promise<AgentResult<'agent.content.read'>>,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const size = Number(ref.byteLength);
  if (!Number.isSafeInteger(size) || size > 33_554_432)
    throw new RemoteConversationError('RESOURCE_UNAVAILABLE');
  const bytes = new Uint8Array(size);
  let offset = 0;
  do {
    signal?.throwIfAborted();
    const page = await readChunk(String(offset), signal);
    const chunk = toByteArray(page.dataBase64);
    if (
      page.contentId !== ref.contentId ||
      page.revision !== ref.revision ||
      page.offset !== String(offset) ||
      page.sha256 !== ref.sha256 ||
      page.nextOffset !== String(offset + chunk.length) ||
      offset + chunk.length > size ||
      page.eof !== (offset + chunk.length === size) ||
      (!page.eof && chunk.length === 0)
    )
      throw new RemoteConversationError('PROTOCOL_ERROR');
    bytes.set(chunk, offset);
    offset += chunk.length;
    if (page.eof) break;
  } while (offset < size);
  if (offset !== size || integrity.sha256(bytes) !== ref.sha256)
    throw new RemoteConversationError('PROTOCOL_ERROR');
  return bytes;
}
export const decodeContent = (bytes: Uint8Array) =>
  new TextDecoder('utf-8', { fatal: true }).decode(bytes);
