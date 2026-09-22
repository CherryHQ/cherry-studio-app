import type {
  AgentMethod,
  AgentParams,
  AgentResult,
  ContentRef,
} from '@cherrystudio/remote-protocol/agent';
import { sha256 } from '@noble/hashes/sha2.js';
import { toByteArray } from 'base64-js';

import { RemoteAgentError } from './RemoteAgentError';

export type AgentRequest = <M extends AgentMethod>(
  method: M,
  params: AgentParams<M>,
  signal?: AbortSignal,
) => Promise<AgentResult<M>>;
export const integrity = {
  sha256: (bytes: Uint8Array) =>
    Array.from(sha256(bytes), (byte) => byte.toString(16).padStart(2, '0')).join(''),
};

/** Reads a pinned revision and validates every offset plus the complete digest, including split UTF-8. */
export async function readContent(
  request: AgentRequest,
  sessionId: string,
  ref: ContentRef,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const size = Number(ref.byteLength);
  if (!Number.isSafeInteger(size) || size > 33_554_432)
    throw new RemoteAgentError('RESOURCE_UNAVAILABLE');
  const bytes = new Uint8Array(size);
  let offset = 0;
  do {
    signal?.throwIfAborted();
    const page = await request(
      'agent.content.read',
      {
        sessionId,
        contentId: ref.contentId,
        revision: ref.revision,
        offset: String(offset),
        maxBytes: 24_576,
      },
      signal,
    );
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
      throw new RemoteAgentError('PROTOCOL_ERROR');
    bytes.set(chunk, offset);
    offset += chunk.length;
    if (page.eof) break;
  } while (offset < size);
  if (offset !== size || integrity.sha256(bytes) !== ref.sha256)
    throw new RemoteAgentError('PROTOCOL_ERROR');
  return bytes;
}
export const decodeContent = (bytes: Uint8Array) =>
  new TextDecoder('utf-8', { fatal: true }).decode(bytes);
