import {
  Stack,
  type Href,
  useLocalSearchParams,
  useNavigation,
  usePreventRemove,
  useRouter,
} from 'expo-router';
import { useState } from 'react';

import { clearCloudModelTap } from './accountNavigation';
import { readAccountReturnTo } from './accountRoute';
import { type LoginPurpose, LoginScreen } from './LoginScreen';
import { useAccount } from './useAccount';
import { useAccountErrorReporter } from './useAccountErrorReporter';

/**
 * Settings and reauthentication share one route. Each entry keeps its own completion target.
 */
export function LoginRoute() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    purpose?: string;
    cancelTo?: string | string[];
    returnTo?: string | string[];
  }>();
  const returnTo = readAccountReturnTo(params.returnTo) ?? '/settings/profile';
  const cancelTo = readAccountReturnTo(params.cancelTo) ?? returnTo;
  const { account, state } = useAccount();
  const reportError = useAccountErrorReporter('LoginRoute');
  // Fixed at entry: signing in changes the account state before this page leaves.
  const [entryPurpose] = useState<LoginPurpose>(
    state.isEnterprise && state.needsSignIn
      ? 'expired'
      : (state.isSignedIn && params.purpose !== 'sign-in') || state.isEnterprise
        ? 'switch'
        : 'sign-in',
  );
  const purpose = state.isEnterprise && state.needsSignIn ? 'expired' : entryPurpose;
  const [leaving, setLeaving] = useState(false);
  const allowLeave = usePreventRemove(
    !leaving && purpose === 'expired' && state.needsSignIn,
    ({ repeat }) => {
      // A callback may complete before React has committed the new account snapshot.
      if (!account.getState().needsSignIn) {
        setLeaving(true);
        repeat();
      }
    },
  );
  const leave = (destination: string) => {
    if (!navigation.isFocused()) return;
    setLeaving(true);
    allowLeave();
    router.dismissTo(destination as Href);
  };
  const signOut = () =>
    void account.signOut().catch((error: unknown) => reportError(error, 'account.signOut'));
  return (
    <>
      <Stack.Screen options={{ gestureEnabled: purpose !== 'expired' }} />
      <LoginScreen
        key={purpose}
        onLeave={
          purpose === 'expired'
            ? signOut
            : () => {
                clearCloudModelTap(returnTo);
                leave(cancelTo);
              }
        }
        onSignedIn={() => leave(returnTo)}
        purpose={purpose}
        returnTo={returnTo}
      />
    </>
  );
}
