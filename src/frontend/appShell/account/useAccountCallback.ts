import { clearInitialURL, useLinkingURL } from 'expo-linking';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { usePreference } from '@/frontend/data';

import { getAccountReturnTo } from './accountNavigation';
import { accountSignInHref } from './accountRoute';
import { useAccount } from './useAccount';
import { useAccountErrorReporter } from './useAccountErrorReporter';

/** Browser and cold-start completions end at the same profile-scoped entry target. */
export function useAccountCallback() {
  const url = useLinkingURL();
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
  const completion = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    if (!completion.current) {
      if (!url) return;
      // Clear before activation so a profile reload cannot redeem the callback again.
      clearInitialURL();
      completion.current = account.receiveRedirect(url);
    }
    let active = true;
    void completion.current.then(
      (stayed) => {
        if (active && stayed) router.dismissTo(returnTo as Href);
      },
      (error: unknown) => {
        if (!active) return;
        reportError(error, 'account.callback');
        const state = account.getState();
        router.dismissTo(
          state.isEnterprise && state.needsSignIn
            ? accountSignInHref(returnTo, 'expired')
            : (returnTo as Href),
        );
      },
    );
    return () => {
      active = false;
    };
  }, [url, account, router, reportError, returnTo]);
}
