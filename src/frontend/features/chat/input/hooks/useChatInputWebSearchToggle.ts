import { useCallback, useRef, useState } from 'react';

type WebSearchOverride = {
  /** The assistant the switch was flipped on; a different one starts over. */
  assistantId: string;
  enabled: boolean;
};

type PendingWrite = {
  assistantId: string;
  enabled: boolean;
  isUpdating: boolean;
};

/**
 * The web search switch. The assistant record is the source of truth — this
 * only holds the user's flip until the persisted value catches up with it, so
 * the switch answers the touch immediately instead of waiting on a round trip.
 *
 * Only the flip is state. Whether it still applies is decided on read, the same
 * way `useChatInputReasoningEffortSelection` decides it: a value mirrored into
 * state through an effect would be stale for exactly as long as it takes the
 * query to catch up, and reconciling an optimistic write against the query it
 * is racing is what made the previous version of this the repository's only
 * `react-hooks/set-state-in-effect` suppression.
 *
 * Writes are serialised. Flipping the switch during an in-flight write updates
 * that write's target rather than queueing a second one, so a burst of taps
 * settles on the last one instead of replaying all of them.
 */
export function useChatInputWebSearchToggle(
  assistantId: string | null,
  persistedEnabled: boolean,
  persist: (assistantId: string, enabled: boolean) => Promise<unknown>,
  onPersistError?: (error: unknown) => void,
) {
  const [override, setOverride] = useState<WebSearchOverride | null>(null);
  const pending = useRef<PendingWrite | null>(null);

  // Retire the override during render, not from an effect: a flip made on one
  // assistant must not follow the user to the next, and once the persisted
  // value agrees there is nothing left to override.
  let activeOverride = override;
  if (
    activeOverride &&
    (activeOverride.assistantId !== assistantId || activeOverride.enabled === persistedEnabled)
  ) {
    activeOverride = null;
    setOverride(null);
  }

  const setEnabled = useCallback(
    (nextEnabled: boolean) => {
      if (!assistantId) {
        return;
      }

      setOverride({ assistantId, enabled: nextEnabled });

      const current = pending.current;

      if (current?.assistantId === assistantId) {
        current.enabled = nextEnabled;

        // The in-flight write will pick the new target up when it loops.
        if (current.isUpdating) {
          return;
        }
      } else {
        pending.current = { assistantId, enabled: nextEnabled, isUpdating: false };
      }

      void (async () => {
        while (pending.current?.assistantId === assistantId) {
          const write = pending.current;
          const attempted = write.enabled;
          write.isUpdating = true;

          try {
            await persist(assistantId, attempted);
          } catch (error) {
            const latest: PendingWrite | null = pending.current;

            // A newer target arrived while this failed, so let the loop write
            // that one instead of rolling back to a value already superseded.
            if (latest?.assistantId === assistantId && latest.enabled !== attempted) {
              latest.isUpdating = false;
              continue;
            }

            pending.current = null;
            setOverride(null);
            onPersistError?.(error);
            return;
          }

          const latest: PendingWrite | null = pending.current;

          if (latest?.assistantId !== assistantId || latest.enabled === attempted) {
            // Landed. The override stays until the query reports the new value,
            // and the render-time check above clears it then.
            pending.current = null;
            return;
          }

          latest.isUpdating = false;
        }
      })();
    },
    [assistantId, onPersistError, persist],
  );

  return {
    enabled: activeOverride?.enabled ?? persistedEnabled,
    setEnabled,
  };
}
