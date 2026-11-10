import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from 'react';

import type { ConversationMessage } from '@/frontend/appShell/conversation';

/**
 * The feature-owned state a transcript row renders beyond its `MessageListItem`.
 * LegendList refreshes a row only when its item or the list-wide `extraData`
 * changes, so this state reaches the row through its own keyed subscription.
 */
export type ChatMessageRowState = Readonly<
  Pick<ConversationMessage, 'attachments' | 'tools'> & {
    /** Deferred source text cannot be translated until the full answer has arrived. */
    completeness?: ConversationMessage['completeness'];
    /** Tool status follows the source message, which can settle without new display parts. */
    messageState?: ConversationMessage['state'];
    showsTimestamp: boolean;
    previousMessageId?: string;
    nextMessageId?: string;
    nextShowsTimestamp?: boolean;
  }
>;

type ChatMessageRows = ReadonlyMap<string, ChatMessageRowState>;

const EMPTY_ROW: ChatMessageRowState = { showsTimestamp: false };
const TIMESTAMP_ONLY_ROW: ChatMessageRowState = { showsTimestamp: true };

function isSameRow(left: ChatMessageRowState, right: ChatMessageRowState) {
  return (
    left.completeness === right.completeness &&
    left.attachments === right.attachments &&
    left.messageState === right.messageState &&
    left.showsTimestamp === right.showsTimestamp &&
    left.previousMessageId === right.previousMessageId &&
    left.nextMessageId === right.nextMessageId &&
    left.nextShowsTimestamp === right.nextShowsTimestamp &&
    left.tools === right.tools
  );
}

/** Reuses every unchanged row state, and the whole map when no row changed. */
function reconcileRows(
  previous: ChatMessageRows,
  messages: readonly ConversationMessage[],
  timestampMessageIds: ReadonlySet<string>,
  breakAfterMessageId?: string,
): ChatMessageRows {
  const next = new Map<string, ChatMessageRowState>();
  const visibleMessages = messages.filter((message) => message.display.role !== 'system');
  for (const [index, message] of visibleMessages.entries()) {
    const candidate: ChatMessageRowState = {
      completeness: message.completeness,
      attachments: message.attachments,
      messageState: message.state,
      showsTimestamp: timestampMessageIds.has(message.key),
      tools: message.tools,
      previousMessageId:
        visibleMessages[index - 1]?.key === breakAfterMessageId
          ? undefined
          : visibleMessages[index - 1]?.key,
      nextMessageId:
        message.key === breakAfterMessageId ? undefined : visibleMessages[index + 1]?.key,
      nextShowsTimestamp: visibleMessages[index + 1]
        ? timestampMessageIds.has(visibleMessages[index + 1].key)
        : false,
    };
    const existing = previous.get(message.key);
    next.set(message.key, existing && isSameRow(existing, candidate) ? existing : candidate);
  }
  // Rows shown before their source message arrives, such as a pending send.
  for (const id of timestampMessageIds) {
    if (!next.has(id)) next.set(id, TIMESTAMP_ONLY_ROW);
  }

  if (next.size !== previous.size) return next;
  for (const [id, row] of next) {
    if (previous.get(id) !== row) return next;
  }
  return previous;
}

type ChatMessageRowSource = Readonly<{
  get: (messageId: string) => ChatMessageRowState;
  /** Records rows for descendants rendering in the same pass. */
  record: (
    messages: readonly ConversationMessage[],
    timestampMessageIds: ReadonlySet<string>,
    breakAfterMessageId?: string,
  ) => void;
  /** Wakes only rows whose state changed since the last publish. */
  publish: () => void;
  subscribe: (messageId: string, listener: () => void) => () => void;
}>;

function createChatMessageRowSource(): ChatMessageRowSource {
  let rows: ChatMessageRows = new Map();
  let publishedRows = rows;
  const listenersById = new Map<string, Set<() => void>>();
  return {
    get: (messageId) => rows.get(messageId) ?? EMPTY_ROW,
    record: (messages, timestampMessageIds, breakAfterMessageId) => {
      rows = reconcileRows(rows, messages, timestampMessageIds, breakAfterMessageId);
    },
    publish: () => {
      if (publishedRows === rows) return;
      const previousRows = publishedRows;
      publishedRows = rows;
      for (const [messageId, listeners] of listenersById) {
        if (previousRows.get(messageId) === rows.get(messageId)) continue;
        for (const listener of listeners) listener();
      }
    },
    subscribe: (messageId, listener) => {
      let listeners = listenersById.get(messageId);
      if (!listeners) {
        listeners = new Set();
        listenersById.set(messageId, listeners);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) listenersById.delete(messageId);
      };
    },
  };
}

const ChatMessageRowContext = createContext<ChatMessageRowSource | null>(null);
const unsubscribeNothing = () => {};

export function ChatMessageRowProvider({
  children,
  messages,
  timestampMessageIds,
  breakAfterMessageId,
}: PropsWithChildren<{
  messages: readonly ConversationMessage[];
  timestampMessageIds: ReadonlySet<string>;
  breakAfterMessageId?: string;
}>) {
  const [source] = useState(createChatMessageRowSource);
  // Rows whose items changed in this commit render with the new state directly;
  // the publish reaches the remaining rows whose own state changed.
  source.record(messages, timestampMessageIds, breakAfterMessageId);
  useLayoutEffect(() => {
    source.publish();
  }, [breakAfterMessageId, messages, source, timestampMessageIds]);

  return <ChatMessageRowContext value={source}>{children}</ChatMessageRowContext>;
}

export function useChatMessageRow(messageId: string) {
  const source = use(ChatMessageRowContext);
  const subscribe = useCallback(
    (listener: () => void) => (source ? source.subscribe(messageId, listener) : unsubscribeNothing),
    [messageId, source],
  );
  const getSnapshot = useCallback(
    () => (source ? source.get(messageId) : EMPTY_ROW),
    [messageId, source],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
