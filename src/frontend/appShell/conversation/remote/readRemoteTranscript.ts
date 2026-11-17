import type { RemoteAgentSource } from '@/shared/contracts/remoteAgent';

import type { TranscriptSnapshot } from '../contracts';
import { ConversationReadError } from '../conversationState';
import { remoteTranscriptMessage } from './remoteConversationViews';

/** Read original content under one desktop revision, without opening an observed chat. */
export async function readRemoteTranscript(
  source: Pick<RemoteAgentSource, 'readSession' | 'history'>,
  sessionId: string,
  signal: AbortSignal,
  assertCurrent: () => void,
  messageIds?: readonly string[],
): Promise<TranscriptSnapshot> {
  signal.throwIfAborted();
  const ids = messageIds ? new Set(messageIds) : undefined;
  const fixed = await source.readSession(sessionId, signal);
  assertCurrent();
  signal.throwIfAborted();
  const selected = [];
  let cursor: string | undefined;
  const visited = new Set<string>();
  do {
    signal.throwIfAborted();
    const page = await source.history(sessionId, fixed.historyVersion, cursor, signal);
    assertCurrent();
    signal.throwIfAborted();
    selected.push(
      ...page.items.filter((message) => (ids ? ids.has(message.id) : message.role !== 'system')),
    );
    cursor = page.next;
    if (cursor && visited.has(cursor))
      throw new ConversationReadError({ code: 'internal', retry: 'none' });
    if (cursor) visited.add(cursor);
  } while (cursor && selected.length < (ids?.size ?? Infinity));
  if (
    (ids && selected.length !== ids.size) ||
    selected.some((message) => message.state === 'streaming' || message.role === 'system')
  )
    throw new ConversationReadError({ code: 'conflict', retry: 'read-again' });
  const current = await source.readSession(sessionId, signal);
  assertCurrent();
  signal.throwIfAborted();
  if (current.historyVersion !== fixed.historyVersion)
    throw new ConversationReadError({ code: 'version-expired', retry: 'read-again' });
  return { title: fixed.title, messages: selected.toReversed().map(remoteTranscriptMessage) };
}
