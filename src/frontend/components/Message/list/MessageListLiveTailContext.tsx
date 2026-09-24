import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from 'react';

type LiveTailSource = Readonly<{
  get: () => boolean;
  /** Records the rendered value so descendants in the same render read it. */
  record: (isVisible: boolean) => void;
  /** Wakes subscribers that did not render with the recorded value. */
  publish: () => void;
  subscribe: (listener: () => void) => () => void;
}>;

function createLiveTailSource(initialIsVisible: boolean): LiveTailSource {
  let isVisible = initialIsVisible;
  let publishedIsVisible = initialIsVisible;
  const listeners = new Set<() => void>();
  return {
    get: () => isVisible,
    record: (next) => {
      isVisible = next;
    },
    publish: () => {
      if (publishedIsVisible === isVisible) return;
      publishedIsVisible = isVisible;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const MessageListLiveTailContext = createContext<LiveTailSource | null>(null);
const unsubscribeNothing = () => {};

type MessageListLiveTailProviderProps = {
  children: ReactNode;
  isVisible: boolean;
};

/**
 * Publishes whether the list's growing end is on screen or about to be. Only
 * streaming content reads it, so the value lives in a source instead of the
 * context value: a flip while scrolling reaches the streaming leaf without
 * re-rendering every settled message in the list.
 */
export function MessageListLiveTailProvider({
  children,
  isVisible,
}: MessageListLiveTailProviderProps) {
  const [source] = useState(() => createLiveTailSource(isVisible));
  // Content and visibility can change in one commit; streaming parts rendered in
  // that pass must see the new value, as a context value would provide.
  source.record(isVisible);
  useLayoutEffect(() => {
    source.publish();
  }, [isVisible, source]);

  return <MessageListLiveTailContext value={source}>{children}</MessageListLiveTailContext>;
}

/**
 * Whether the growing end is in view. Settled content passes `false` and never
 * subscribes. Outside a message list (previews, share screens) it is always shown.
 */
export function useMessageListLiveTailVisible(isStreaming: boolean) {
  const source = use(MessageListLiveTailContext);
  const isTracked = isStreaming && source !== null;
  const subscribe = useCallback(
    (listener: () => void) => (isTracked ? source.subscribe(listener) : unsubscribeNothing),
    [isTracked, source],
  );
  const getSnapshot = useCallback(() => (isTracked ? source.get() : true), [isTracked, source]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
