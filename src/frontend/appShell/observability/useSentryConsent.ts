import { useSyncExternalStore } from 'react';

import { getSentryConsentStatus, subscribeSentryConsent } from './configureSentry';

export function useSentryConsent() {
  return useSyncExternalStore(
    subscribeSentryConsent,
    getSentryConsentStatus,
    getSentryConsentStatus,
  );
}
