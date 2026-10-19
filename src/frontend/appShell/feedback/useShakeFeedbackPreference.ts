import { useCallback } from 'react';

import { useMultiplePreferences } from '@/frontend/data/hooks';

const PREFERENCES = {
  enabled: 'app.feedback.shake_enabled',
  decision: 'app.feedback.shake_hint_decision',
} as const;

/** A manual choice also settles discovery, so disabling never invites re-enabling. */
export function useShakeFeedbackPreference() {
  const [value, setValue] = useMultiplePreferences(PREFERENCES);
  const setEnabled = useCallback(
    (enabled: boolean) =>
      setValue({ enabled, decision: enabled ? 'accepted' : 'ignored' }, { optimistic: false }),
    [setValue],
  );
  const ignoreHint = useCallback(
    () => setValue({ decision: 'ignored' }, { optimistic: false }),
    [setValue],
  );
  return { ...value, setEnabled, ignoreHint };
}
