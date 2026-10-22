import { startTransition, useCallback, useMemo, useState } from 'react';

import { messageWindowPolicy } from './utils/messageWindowPolicy';

type MessageWindowItem = {
  id: string;
};

type MessageWindowSignature = {
  firstId: string | undefined;
  ids: readonly string[];
  lastId: string | undefined;
  length: number;
};

type MessageRenderWindowState = {
  signature: MessageWindowSignature;
  visibleCount: number;
};

function getMessageWindowSignature(messages: readonly MessageWindowItem[]): MessageWindowSignature {
  return {
    firstId: messages[0]?.id,
    ids: messages.map((message) => message.id),
    lastId: messages[messages.length - 1]?.id,
    length: messages.length,
  };
}

export function getVisibleCountForWindow(
  currentVisibleCount: number,
  previous: MessageWindowSignature | null,
  current: MessageWindowSignature,
) {
  if (current.length === 0) {
    return 0;
  }

  if (!previous || currentVisibleCount === 0) {
    return Math.min(messageWindowPolicy.initialRenderCount, current.length);
  }

  if (
    previous.firstId === current.firstId &&
    previous.lastId === current.lastId &&
    previous.length === current.length
  ) {
    return Math.min(currentVisibleCount, current.length);
  }

  const prependedCount = current.length - previous.length;
  if (
    previous.lastId === current.lastId &&
    previous.firstId !== current.firstId &&
    prependedCount > 0
  ) {
    return Math.min(current.length, currentVisibleCount + prependedCount);
  }

  // A bounded refetch can move both ends without replacing the conversation.
  // Keep its earliest surviving rendered row, including any new tail messages.
  const previouslyVisibleIds = new Set(
    previous.ids.slice(Math.max(0, previous.length - currentVisibleCount)),
  );
  const firstVisibleIndex = current.ids.findIndex((id) => previouslyVisibleIds.has(id));
  if (firstVisibleIndex >= 0) return current.length - firstVisibleIndex;

  return Math.min(messageWindowPolicy.initialRenderCount, current.length);
}

export function useMessageRenderWindow<TMessage extends MessageWindowItem>(
  messages: readonly TMessage[],
) {
  const signature = useMemo(() => getMessageWindowSignature(messages), [messages]);
  const [renderWindow, setRenderWindow] = useState<MessageRenderWindowState>(() => ({
    signature,
    visibleCount: Math.min(messageWindowPolicy.initialRenderCount, messages.length),
  }));
  let effectiveVisibleCount = renderWindow.visibleCount;

  if (!areMessageWindowSignaturesEqual(renderWindow.signature, signature)) {
    effectiveVisibleCount = getVisibleCountForWindow(
      renderWindow.visibleCount,
      renderWindow.signature,
      signature,
    );
    setRenderWindow({ signature, visibleCount: effectiveVisibleCount });
  }

  const revealMore = useCallback(() => {
    startTransition(() => {
      setRenderWindow((current) => ({
        ...current,
        visibleCount: Math.min(
          messages.length,
          current.visibleCount + messageWindowPolicy.revealCount,
        ),
      }));
    });
  }, [messages.length]);

  const visibleMessages = useMemo(
    () => messages.slice(Math.max(0, messages.length - effectiveVisibleCount)),
    [messages, effectiveVisibleCount],
  );

  return {
    hasHiddenMessages: effectiveVisibleCount < messages.length,
    hiddenMessageCount: Math.max(0, messages.length - effectiveVisibleCount),
    revealMore,
    visibleMessages,
  };
}

function areMessageWindowSignaturesEqual(
  first: MessageWindowSignature,
  second: MessageWindowSignature,
): boolean {
  return (
    first.firstId === second.firstId &&
    first.lastId === second.lastId &&
    first.length === second.length &&
    first.ids.every((id, index) => id === second.ids[index])
  );
}
