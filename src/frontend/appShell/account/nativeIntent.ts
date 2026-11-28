import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { clearInitialURL, getLinkingURL } from 'expo-linking';

import { isAccountCallbackUrl, type AccountModule } from '@/shared/contracts/account';
import { resolveNativeCallbackUrl } from '@/shared/utils/nativeCallbackUrl';

type Delivery = {
  id: string;
  urls: string[];
  result?: Promise<boolean> | null;
};

let staged: Delivery | undefined;

export function discardAccountCallback() {
  staged = undefined;
}

/** Keep the original URLs in memory while native routing opens a credential-free page. */
export function routeAccountCallback(path: string, destination: string | null): string | null {
  if (
    !isAccountCallbackUrl(
      path,
      resolveNativeCallbackUrl(Constants.expoConfig?.scheme, 'auth/callback'),
    )
  ) {
    // A warm callback handled in place leaves the account route and its delivery intact.
    if (destination !== null) staged = undefined;
    return destination;
  }
  if (!staged || staged.result !== undefined) staged = { id: randomUUID(), urls: [] };
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
  let result = previous;
  for (const url of batch.urls.splice(0)) {
    const delivery = account.receiveRedirect(url);
    if (!delivery) continue;
    if (getLinkingURL() === url) clearInitialURL();
    result = keepSuccessfulAccountResult(result, delivery);
  }
  batch.result =
    result?.finally(() => {
      if (staged === batch) staged = undefined;
    }) ?? null;
  return batch.result;
}
