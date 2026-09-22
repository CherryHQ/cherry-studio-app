import { useCallback, useState } from 'react';

import { useMultiplePreferences, usePreference } from '@/frontend/data/hooks';
import { LATEST_PRIVACY_POLICY_VERSION } from '@/shared/utils/privacyConsent';

const CONSENT_KEYS = {
  dataCollectionEnabled: 'app.privacy.data_collection.enabled',
  policyVersion: 'app.privacy.policy_version',
} as const;

/** Consent must be on disk before the dialog closes, so an optimistic write will not do. */
const PESSIMISTIC = { optimistic: false } as const;

/**
 * Whether the current disclosure still has to be shown.
 *
 * Read separately from {@link usePrivacyConsent} by surfaces that only need to
 * stay out of the dialog's way, such as holding the onboarding logo reveal.
 */
export function usePrivacyConsentPending(): boolean {
  const [policyVersion] = usePreference('app.privacy.policy_version');
  return policyVersion !== LATEST_PRIVACY_POLICY_VERSION;
}

/**
 * The first-launch privacy decision.
 *
 * Both answers record the policy version. Only recording it on acceptance would
 * strand a declining user: nothing else writes that key, so the switch in
 * settings would turn on without ever satisfying the consent predicate. The
 * version therefore means "this disclosure was shown", and whether collection
 * runs is carried by the switch alone.
 */
export function usePrivacyConsent() {
  const [{ policyVersion }, setConsent] = useMultiplePreferences(CONSENT_KEYS);
  const [isSaving, setIsSaving] = useState(false);

  const record = useCallback(
    async (dataCollectionEnabled: boolean) => {
      setIsSaving(true);
      try {
        await setConsent(
          { dataCollectionEnabled, policyVersion: LATEST_PRIVACY_POLICY_VERSION },
          PESSIMISTIC,
        );
        return true;
      } catch {
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [setConsent],
  );

  return {
    /** Re-enables collection, so accepting a new policy undoes an earlier decline. */
    accept: useCallback(() => record(true), [record]),
    decline: useCallback(() => record(false), [record]),
    isPending: policyVersion !== LATEST_PRIVACY_POLICY_VERSION,
    isSaving,
  };
}
