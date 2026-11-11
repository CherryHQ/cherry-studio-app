import type { ComposerAttachmentDraft } from '@/frontend/components/Composer/utils/composerAttachments';
import { cacheService } from '@/frontend/data/CacheService';
import type { AgentSubmitMessageInput, QuoteFields } from '@/shared/contracts/agent';
import { fileEntryUrl } from '@/shared/data/types/file';

import { restoreQuoteMentions } from '../quotes/quoteMentions';

export type FollowupDraft = Readonly<{
  text: string;
  attachments: readonly ComposerAttachmentDraft[];
  quote: QuoteFields;
}>;

export type FollowupQueueItem = Readonly<{
  id: string;
  request: AgentSubmitMessageInput;
  draft: FollowupDraft;
}>;

export type FollowupSendOutcome = 'accepted' | 'cancelled' | 'failed';

export type FollowupQueueState = Readonly<{
  items: readonly FollowupQueueItem[];
  isPaused: boolean;
  pendingId: string | null;
  consumedCompletionId: string | null;
  stoppedTurnId: string | null;
  hasFailedSend: boolean;
}>;

const EMPTY_QUEUE: FollowupQueueState = Object.freeze({
  items: Object.freeze([]),
  isPaused: false,
  pendingId: null,
  consumedCompletionId: null,
  stoppedTurnId: null,
  hasFailedSend: false,
});

const keyFor = (sessionId: string) => `chat.followup_queue.${sessionId}`;

export function readFollowupQueue(sessionId: string): FollowupQueueState {
  return cacheService.getCasual<FollowupQueueState>(keyFor(sessionId)) ?? EMPTY_QUEUE;
}

function writeQueue(sessionId: string, state: FollowupQueueState) {
  cacheService.setCasual(keyFor(sessionId), state);
}

export function subscribeFollowupQueue(sessionId: string, listener: () => void) {
  return cacheService.subscribe(keyFor(sessionId), listener);
}

export function enqueueFollowup(item: FollowupQueueItem, completionId: string | null) {
  const { sessionId } = item.request;
  const state = readFollowupQueue(sessionId);
  writeQueue(sessionId, {
    ...state,
    items: [...state.items, item],
    consumedCompletionId: state.items.length ? state.consumedCompletionId : completionId,
  });
}

export function setFollowupQueuePaused(sessionId: string, isPaused: boolean) {
  const state = readFollowupQueue(sessionId);
  if (!state.items.length) return;
  writeQueue(sessionId, { ...state, isPaused, hasFailedSend: false });
}

export function stopFollowupAdvance(sessionId: string, turnId: string) {
  const state = readFollowupQueue(sessionId);
  if (state.items.length) writeQueue(sessionId, { ...state, stoppedTurnId: turnId });
}

export function removeFollowup(sessionId: string, id: string): FollowupQueueItem | undefined {
  const state = readFollowupQueue(sessionId);
  if (state.pendingId === id) return;
  const item = state.items.find((candidate) => candidate.id === id);
  if (item)
    writeQueue(sessionId, {
      ...state,
      items: state.items.filter((candidate) => candidate.id !== id),
    });
  return item;
}

export function reorderFollowups(sessionId: string, items: readonly FollowupQueueItem[]) {
  const state = readFollowupQueue(sessionId);
  if (
    state.pendingId ||
    items.length !== state.items.length ||
    new Set(items.map((item) => item.id)).size !== items.length ||
    items.some((item) => !state.items.includes(item))
  )
    return;
  writeQueue(sessionId, { ...state, items });
}

export function claimFollowup(sessionId: string, id: string): FollowupQueueItem | undefined {
  const state = readFollowupQueue(sessionId);
  if (state.pendingId) return;
  const item = state.items.find((candidate) => candidate.id === id);
  if (item) writeQueue(sessionId, { ...state, pendingId: id, hasFailedSend: false });
  return item;
}

export function settleFollowup(
  sessionId: string,
  id: string,
  outcome: FollowupSendOutcome,
  completionId: string | null,
) {
  const state = readFollowupQueue(sessionId);
  if (state.pendingId !== id) return;
  writeQueue(sessionId, {
    ...state,
    pendingId: null,
    items: outcome === 'accepted' ? state.items.filter((item) => item.id !== id) : state.items,
    consumedCompletionId: outcome === 'failed' ? state.consumedCompletionId : completionId,
    isPaused: outcome === 'failed' ? true : state.isPaused,
    hasFailedSend: outcome === 'failed',
  });
}

export function clearFollowupQueue(sessionId: string) {
  cacheService.deleteCasual(keyFor(sessionId));
}

export function followupDraftFromInput(input: AgentSubmitMessageInput): FollowupDraft {
  const quoted = input.parts.find((part) => part.type === 'text' && part.quotes);
  return {
    text: input.parts
      .flatMap((part) =>
        part.type === 'text' ? [restoreQuoteMentions(part.text, part.quotes)] : [],
      )
      .join('\n'),
    quote:
      quoted?.type === 'text' ? { quotes: quoted.quotes, quoteAuthor: quoted.quoteAuthor } : {},
    attachments: input.parts.flatMap<ComposerAttachmentDraft>((part) =>
      part.type === 'file'
        ? [
            {
              id: part.fileEntryId,
              fileEntryId: part.fileEntryId,
              kind: part.mediaType.startsWith('image/') ? 'image' : 'file',
              mediaType: part.mediaType,
              name: part.filename ?? part.fileEntryId,
              status: 'ready',
              uri: fileEntryUrl(part.fileEntryId),
            },
          ]
        : [],
    ),
  };
}
