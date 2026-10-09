import {
  createContext,
  type PropsWithChildren,
  type ReactNode,
  use,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';

import type { ConversationSource, ConversationSourceRef } from './contracts';
import { useConversationSources } from './ConversationProvider';

const SourceContext = createContext<ConversationSource | null>(null);

/** One catalog/route consumer. Retired bindings cannot carry cached rows into replacement credentials. */
export function ConversationSourceBoundary({
  source: ref,
  fallback,
  children,
}: PropsWithChildren<{
  source: ConversationSourceRef;
  fallback(state: 'loading' | 'error'): ReactNode;
}>) {
  const sources = useConversationSources();
  const key = JSON.stringify(ref);
  const [resolved, setResolved] = useState<{
    key: string;
    source?: ConversationSource;
    failed?: boolean;
  }>();
  useEffect(() => {
    const lifetime = new AbortController();
    let release: (() => void) | undefined;
    let unsubscribe: (() => void) | undefined;
    let opening = false;
    const open = () => {
      if (opening || lifetime.signal.aborted) return;
      opening = true;
      unsubscribe?.();
      release?.();
      setResolved({ key });
      void sources
        .open(ref, lifetime.signal)
        .then((retained) => {
          if (lifetime.signal.aborted) {
            retained.release();
            return;
          }
          release = retained.release;
          unsubscribe = retained.source.state.subscribe(() => {
            const { availability } = retained.source.state.getSnapshot();
            if (availability.state === 'disabled' && availability.reason === 'retired') open();
          });
          setResolved({ key, source: retained.source });
        })
        .catch(() => {
          if (!lifetime.signal.aborted) setResolved({ key, failed: true });
        })
        .finally(() => {
          opening = false;
        });
    };
    open();
    return () => {
      lifetime.abort();
      unsubscribe?.();
      release?.();
    };
    // Equivalent source addresses retain the same observation owner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, key]);
  const current = resolved?.key === key ? resolved : undefined;
  return (
    <SourceContext value={current?.source ?? null}>
      {current?.source ? children : fallback(current?.failed ? 'error' : 'loading')}
    </SourceContext>
  );
}
export function useConversationSource() {
  const source = use(SourceContext);
  if (!source) throw new Error('ConversationSourceBoundary is required');
  return source;
}
export function useConversationSourceState() {
  const source = useConversationSource();
  return useSyncExternalStore(
    source.state.subscribe,
    source.state.getSnapshot,
    source.state.getSnapshot,
  );
}
