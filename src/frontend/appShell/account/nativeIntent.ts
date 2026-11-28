import { loggerService } from '@logger';
import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { getLinkingURL } from 'expo-linking';
import { Platform } from 'react-native';

import { isAccountCallbackUrl, type AccountModule } from '@/shared/contracts/account';
import { resolveNativeCallbackUrl } from '@/shared/utils/nativeCallbackUrl';

import { retireNativeUrl } from '../../../../modules/system-integration/linking';

type Delivery = {
  id: string;
  initial: boolean;
  urls: string[];
  result?: Promise<boolean> | null;
};

let staged: Delivery | undefined;

export function discardAccountCallback() {
  const abandoned = staged;
  staged = undefined;
  for (const url of abandoned?.urls ?? []) {
    void retireNativeUrl(url).catch(() => {
      loggerService
        .withContext('AccountCallback')
        .warn('Could not retire an abandoned account URL');
    });
  }
}

function isInstalledAccountUrl(url: string) {
  return isAccountCallbackUrl(
    url,
    resolveNativeCallbackUrl(Constants.expoConfig?.scheme, 'auth/callback'),
  );
}

/** Keep the original URLs in memory while native routing opens a credential-free page. */
export function routeAccountCallback(
  { path, initial }: { path: string; initial: boolean },
  destination: string | null,
): string | null {
  if (!isInstalledAccountUrl(path)) {
    // A warm callback handled in place leaves the account route and its delivery intact.
    if (destination !== null) discardAccountCallback();
    return destination;
  }
  if (!staged || staged.result !== undefined) staged = { id: randomUUID(), initial, urls: [] };
  if (!staged.urls.includes(path)) staged.urls.push(path);
  return `/auth/callback?delivery=${staged.id}`;
}

function keepSuccessfulAccountResult(
  previous: Promise<boolean> | null,
  delivery: Promise<boolean>,
) {
  if (!previous) return delivery;
  const prior = previous.catch(() => null);
  return delivery.catch(async (error: unknown) => {
    const stayed = await prior;
    if (stayed === null) throw error;
    return stayed;
  });
}

export function claimAccountCallback(
  id: string | undefined,
  account: AccountModule,
  previous: Promise<boolean> | null,
): Promise<boolean> | null {
  const batch = staged;
  if (!batch || batch.id !== id) return null;
  if (batch.result !== undefined) return batch.result;
  const urls = batch.urls.splice(0);
  // Android's launch Intent can predate an onNewIntent delivery made before Router subscribed.
  if (batch.initial && Platform.OS === 'android') {
    const latest = getLinkingURL();
    if (latest && !urls.includes(latest) && isInstalledAccountUrl(latest)) urls.push(latest);
  }
  let result = previous;
  for (const url of urls) {
    const delivery = account.receiveRedirect(url);
    if (!delivery) continue;
    result = keepSuccessfulAccountResult(result, delivery);
  }
  batch.result =
    result?.finally(() => {
      if (staged === batch) staged = undefined;
    }) ?? null;
  return batch.result;
}
