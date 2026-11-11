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
  /** Later answer completions cannot release a retained draft. */
  isManualSendRequired?: boolean;
}>;

export type FollowupQueueState = Readonly<{
  items: readonly FollowupQueueItem[];
  pendingId: string | null;
  consumedCompletionId: string | null;
}>;

const EMPTY_QUEUE: FollowupQueueState = Object.freeze({
  items: Object.freeze([]),
  pendingId: null,
  consumedCompletionId: null,
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

function holdItems(items: readonly FollowupQueueItem[]) {
  return items.map((item) =>
    item.isManualSendRequired ? item : { ...item, isManualSendRequired: true },
  );
}

export function holdFollowupQueue(sessionId: string) {
  const state = readFollowupQueue(sessionId);
  if (!state.items.some((item) => !item.isManualSendRequired)) return;
  writeQueue(sessionId, { ...state, items: holdItems(state.items) });
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

export function claimFollowup(sessionId: string, id: string): FollowupQueueItem | undefined {
  const state = readFollowupQueue(sessionId);
  if (state.pendingId) return;
  const item = state.items.find((candidate) => candidate.id === id);
  if (item) writeQueue(sessionId, { ...state, pendingId: id });
  return item;
}

export function settleFollowup(
  sessionId: string,
  id: string,
  accepted: boolean,
  completionId: string | null,
) {
  const state = readFollowupQueue(sessionId);
  if (state.pendingId !== id) return;
  writeQueue(sessionId, {
    ...state,
    pendingId: null,
    items: accepted ? state.items.filter((item) => item.id !== id) : holdItems(state.items),
    consumedCompletionId: completionId,
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
