import { useRouter } from 'expo-router';
import { useState } from 'react';

import { type LoginPurpose, LoginScreen } from './LoginScreen';
import { useAccount } from './useAccount';

/**
 * Settings owns this entry; first-use sign-in belongs to onboarding.
 */
export function LoginRoute() {
  const router = useRouter();
  const { state } = useAccount();
  // Fixed at entry: signing in changes the account state before this page leaves.
  const [purpose] = useState<LoginPurpose>(
    state.isSignedIn || state.isEnterprise ? 'switch' : 'sign-in',
  );
  const leave = () => router.back();
  return <LoginScreen onLeave={leave} onSignedIn={leave} purpose={purpose} />;
}
