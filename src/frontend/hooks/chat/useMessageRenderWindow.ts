import { startTransition, useCallback, useMemo, useState } from 'react';

import { messageWindowPolicy } from './utils/messageWindowPolicy';

type MessageWindowItem = {
  id: string;
};

type MessageWindowSignature = {
  firstId: string | undefined;
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

  if (!previous || currentVisibleCount === 0 || current.length < previous.length) {
    return Math.min(messageWindowPolicy.initialRenderCount, current.length);
  }

  if (previous.lastId === current.lastId) {
    const prependedCount = current.length - previous.length;
    if (prependedCount > 0 && previous.firstId !== current.firstId) {
      return Math.min(current.length, currentVisibleCount + prependedCount);
    }

    return Math.min(currentVisibleCount, current.length);
  }

  if (previous.firstId === current.firstId) {
    const appendedCount = current.length - previous.length;
    return Math.min(current.length, currentVisibleCount + appendedCount);
  }

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
    first.length === second.length
  );
}
