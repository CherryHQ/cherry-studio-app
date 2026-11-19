import { useSyncExternalStore } from 'react';

import { useBackendModule } from '@/frontend/data';
import type { CloudUnavailableReason } from '@/shared/contracts/cloud';

export const CLOUD_UNAVAILABLE_KEYS = {
  signed_out: 'account.notSignedIn',
  unavailable: 'chat.errorPart.reason.providerUnavailable',
  not_entitled: 'cloud.notEntitled',
  account_disabled: 'cloud.accountDisabled',
  reauth_required: 'account.login.reSignIn',
  subscription_required: 'cloud.planRequired',
  activation_required: 'cloud.activate',
} as const satisfies Record<CloudUnavailableReason, string>;

/** React binding for the account-scoped Cloud snapshot; credentials stay behind the module. */
export function useCloud() {
  const cloud = useBackendModule('cloud');
  const state = useSyncExternalStore(cloud.subscribe, cloud.getState, cloud.getState);
  return { cloud, state };
}
