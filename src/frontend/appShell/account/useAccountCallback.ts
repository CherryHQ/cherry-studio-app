import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { usePreference } from '@/frontend/data';

import { getAccountReturnTo } from './accountNavigation';
import { accountSignInHref } from './accountRoute';
import {
  claimAccountCallback,
  hasQueuedAccountCallback,
  takeAccountCallbackPresentation,
} from './nativeIntent';
import { useAccount } from './useAccount';
import { useAccountErrorReporter } from './useAccountErrorReporter';

/** Browser and cold-start completions end at the same profile-scoped entry target. */
export function useAccountCallback() {
  const { delivery } = useLocalSearchParams<{ delivery?: string }>();
  const { account } = useAccount();
  const router = useRouter();
  const reportError = useAccountErrorReporter('AccountCallback');
  const [onboarding] = usePreference('app.onboarding.status');
  const [returnTo] = useState(() =>
    getAccountReturnTo(
      onboarding !== 'unseen' && onboarding !== 'completed' && onboarding !== 'skipped'
        ? '/onboarding'
        : '/settings/profile',
    ),
  );
  const completion = useRef<{ delivery?: string; result: Promise<boolean> } | null>(null);

  useEffect(() => {
    if (!completion.current || completion.current.delivery !== delivery) {
      const result = claimAccountCallback(delivery, account, completion.current?.result ?? null);
      if (result) completion.current = { delivery, result };
    }
    if (!completion.current) {
      if (!hasQueuedAccountCallback()) router.dismissTo(returnTo as Href);
      return;
    }
    const claimed = completion.current;
    let active = true;
    void claimed.result.then(
      (stayed) => {
        if (active && takeAccountCallbackPresentation(claimed.delivery) && stayed)
          router.dismissTo(returnTo as Href);
      },
      (error: unknown) => {
        if (!active || !takeAccountCallbackPresentation(claimed.delivery)) return;
        reportError(error, 'account.callback');
        const state = account.getState();
        router.dismissTo(
          state.isEnterprise && state.needsSignIn
            ? accountSignInHref(returnTo, { purpose: 'expired' })
            : (returnTo as Href),
        );
      },
    );
    return () => {
      active = false;
    };
  }, [delivery, account, router, reportError, returnTo]);
}
