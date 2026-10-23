import { useRouter } from 'expo-router';
import { useState } from 'react';

import { type LoginPurpose, LoginScreen } from './LoginScreen';
import { useAccount } from './useAccount';

/**
 * A new installation sees sign-in first and may skip it; afterwards the page opens from the
 * profile to sign in or switch accounts, and closes back there.
 */
export function LoginRoute() {
  const router = useRouter();
  const { account, state } = useAccount();
  // Fixed at entry: signing in or skipping changes the account state before this page leaves.
  const [purpose] = useState<LoginPurpose>(
    !state.hasPrompted
      ? 'first-use'
      : state.isSignedIn || state.isEnterprise
        ? 'switch'
        : 'sign-in',
  );
  // The first-use gate decides whether a new local installation continues to onboarding.
  const leave = () => (purpose === 'first-use' ? router.replace('/') : router.back());
  return (
    <LoginScreen
      onLeave={() => {
        account.dismissPrompt();
        leave();
      }}
      onSignedIn={leave}
      purpose={purpose}
    />
  );
}
