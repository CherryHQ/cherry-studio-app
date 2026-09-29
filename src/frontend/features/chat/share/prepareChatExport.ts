import type { TranscriptSnapshot } from '@/frontend/appShell/conversation';
import {
  DOCUMENT_EXPORT_MAX_SECTIONS,
  DocumentExportError,
} from '@/shared/contracts/documentExport';

import type { ChatShareTarget } from './chatShareTarget';
import { isChatMessageExportable } from './toChatExportDocument';

export class ChatExportError extends Error {
  constructor(readonly code: 'empty' | 'unsettled' | 'missing') {
    super(`Chat export: ${code}`);
    this.name = 'ChatExportError';
  }
}

/** The source owns an immutable selection; the export validates the complete set before use. */
export async function prepareChatExport(
  target: Pick<ChatShareTarget, 'prepareSelection'>,
  messageIds: readonly string[],
  signal: AbortSignal,
): Promise<TranscriptSnapshot> {
  signal.throwIfAborted();
  const ids = new Set(messageIds);
  if (!ids.size) throw new ChatExportError('empty');
  if (ids.size > DOCUMENT_EXPORT_MAX_SECTIONS) throw new DocumentExportError('size-limit');
  const snapshot = await target.prepareSelection([...ids], signal);
  signal.throwIfAborted();
  if (
    snapshot.messages.length !== ids.size ||
    new Set(snapshot.messages.map((message) => message.id)).size !== ids.size ||
    snapshot.messages.some((message) => !ids.has(message.id) || message.role === 'system')
  )
    throw new ChatExportError('missing');
  if (snapshot.messages.some((message) => !isChatMessageExportable(message)))
    throw new ChatExportError('unsettled');
  return snapshot;
}
