import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LoginScreen } from './LoginScreen';
import { useAccount } from './useAccount';

/**
 * A new installation sees sign-in first and may skip it; afterwards the page is opened from
 * account settings and returns there.
 */
export function LoginRoute() {
  const { t } = useTranslation();
  const router = useRouter();
  const { account, state } = useAccount();
  // Fixed at entry: signing in or skipping marks the prompt seen before this page leaves.
  const [isFirstUse] = useState(!state.hasPrompted);
  // The first-use gate decides whether a new local installation continues to onboarding.
  const leave = () => (isFirstUse ? router.replace('/') : router.back());
  return (
    <LoginScreen
      onSignedIn={leave}
      secondaryAction={{
        label: t(isFirstUse ? 'account.login.skip' : 'common.cancel'),
        onPress: () => {
          account.dismissPrompt();
          leave();
        },
      }}
    />
  );
}
