import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import type {
  ConversationRef,
  ConversationSession,
  ConversationSnapshot,
  ConversationSource,
} from './contracts';
import { useConversationSources } from './ConversationProvider';

/** A route owns observation only. Its cleanup cannot cancel an admitted operation. */
export function useConversation(ref: ConversationRef | undefined, source?: ConversationSource) {
  const sources = useConversationSources();
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const key = JSON.stringify([ref ?? null, source?.scope, attempt]);
  const [resolved, setResolved] = useState<{
    key: string;
    session?: ConversationSession;
    error?: Error;
  }>();
  useEffect(() => {
    if (!ref) return;
    const lifetime = new AbortController();
    let releaseSource: (() => void) | undefined;
    let session: ConversationSession | undefined;
    let unobserve: (() => void) | undefined;
    let unsubscribe: (() => void) | undefined;
    let opening = false;
    let retryRequested = false;
    void (
      source ? Promise.resolve({ source, release() {} }) : sources.open(ref.source, lifetime.signal)
    )
      .then((retained) => {
        releaseSource = retained.release;
        if (lifetime.signal.aborted) {
          retained.release();
          return;
        }
        const openSession = async () => {
          if (opening || session || lifetime.signal.aborted) return;
          opening = true;
          try {
            const opened = await retained.source.openSession(ref, lifetime.signal);
            if (lifetime.signal.aborted) {
              opened.dispose();
              return;
            }
            session = opened;
            unobserve = session.activate();
            setResolved({ key, session });
          } catch (error) {
            session?.dispose();
            session = undefined;
            if (!lifetime.signal.aborted)
              setResolved({
                key,
                error: error instanceof Error ? error : new Error(String(error)),
              });
          } finally {
            opening = false;
            if (
              retryRequested &&
              !session &&
              !lifetime.signal.aborted &&
              retained.source.state.getSnapshot().availability.state === 'enabled'
            ) {
              retryRequested = false;
              void openSession();
            }
          }
        };
        // Retain demand after an offline read failure. Reconnection belongs to the backend;
        // when its source becomes usable, retry the route read without another execution.
        unsubscribe = retained.source.state.subscribe(() => {
          if (retained.source.state.getSnapshot().availability.state === 'enabled') {
            if (opening) retryRequested = true;
            else void openSession();
          }
        });
        void openSession();
      })
      .catch((error: unknown) => {
        releaseSource?.();
        if (!lifetime.signal.aborted)
          setResolved({ key, error: error instanceof Error ? error : new Error(String(error)) });
      });
    return () => {
      lifetime.abort();
      unsubscribe?.();
      unobserve?.();
      session?.dispose();
      releaseSource?.();
    };
    // The serialized address identifies the source/session; an equivalent route object does not replace its observation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, source, key, attempt]);
  const current = resolved?.key === key ? resolved : undefined;
  return {
    retry,
    session: current?.session,
    error: current?.error,
    isLoading: Boolean(ref && !current),
  };
}
const EMPTY_SNAPSHOT: ConversationSnapshot = {
  title: '',
  freshness: { state: 'loading' },
  liveMessages: [],
  executions: [],
  interactions: [],
  actions: { inputPolicy: { attachments: false, modelSelection: false, pluginReferences: false } },
};
const emptySnapshot = () => EMPTY_SNAPSHOT;
const noSubscription = () => () => undefined;
export function useConversationSnapshot(session: ConversationSession | undefined) {
  return useSyncExternalStore(
    session?.state.subscribe ?? noSubscription,
    session?.state.getSnapshot ?? emptySnapshot,
    session?.state.getSnapshot ?? emptySnapshot,
  );
}
