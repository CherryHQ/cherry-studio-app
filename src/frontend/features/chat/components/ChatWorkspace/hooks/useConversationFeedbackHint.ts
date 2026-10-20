import { useIsFocused } from 'expo-router';
import { useEffect, useEffectEvent, useRef } from 'react';

import type { ConversationSnapshot } from '@/frontend/appShell/conversation';
import { useFeedbackHint } from '@/frontend/appShell/feedback';

/** Observe live terminal transitions, never historical error-row mounts or tool errors. */
export function useConversationFeedbackHint(
  scope: string,
  snapshot: ConversationSnapshot,
  bottomOffset: number,
) {
  const { show, hide } = useFeedbackHint();
  const isFocused = useIsFocused();
  const previous = useRef<{ scope: string; states: Map<string, string> } | undefined>(undefined);
  const notify = useEffectEvent(() => show(bottomOffset));
  useEffect(() => {
    if (!isFocused || snapshot.freshness.state !== 'current') {
      previous.current = undefined;
      return;
    }
    const last = previous.current;
    previous.current = {
      scope,
      states: new Map(snapshot.executions.map((run) => [run.id, run.state])),
    };
    if (!last || last.scope !== scope) return;
    if (
      snapshot.executions.some(
        (run) => run.state === 'failed' && last.states.get(run.id) !== 'failed',
      )
    ) {
      notify();
    }
  }, [isFocused, scope, snapshot.executions, snapshot.freshness.state]);
  useEffect(() => {
    if (!isFocused) hide();
    return hide;
  }, [hide, isFocused, scope]);
}
