import { ContentState } from '@cherrystudio/ui/components';
import { usePathname } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

import { LoginScreen } from './LoginScreen';
import { useAccount } from './useAccount';
import { useAccountErrorReporter } from './useAccountErrorReporter';

/** Enterprise data is shown only after the restored session matches its profile. */
export function AccountSessionGate({ children }: PropsWithChildren) {
  const reportError = useAccountErrorReporter('AccountSessionGate');
  const { account, state } = useAccount();
  const pathname = usePathname();
  // The callback contains no enterprise data and must be able to repair a missing session.
  if (pathname === '/auth/callback') return children;
  // A cloud sign-in completes in the browser; a private one stays on the form so a failed
  // password keeps what was entered.
  if (
    state.isRestoringSession ||
    (state.isEnterprise && state.needsSignIn && state.isBusy && !state.privateAddress)
  )
    return (
      <View className="flex-1 justify-center">
        <ContentState.Loading />
      </View>
    );
  if (!state.isEnterprise || !state.needsSignIn) return children;
  return (
    <LoginScreen
      onLeave={() =>
        void account.signOut().catch((error: unknown) => {
          reportError(error, 'account.signOut');
        })
      }
      purpose="expired"
    />
  );
}
