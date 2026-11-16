import { ContentState, useToast } from '@cherrystudio/ui/components';
import { loggerService } from '@logger';
import { usePathname } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AccountError } from '@/shared/contracts/account';

import { ACCOUNT_ERROR_KEYS, LoginScreen } from './LoginScreen';
import { useAccount } from './useAccount';

/** Enterprise data is shown only after the restored session matches its profile. */
export function AccountSessionGate({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const { toast } = useToast();
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
          loggerService.withContext('AccountSessionGate').error('Sign-out failed', error as Error, {
            operation: 'account.signOut',
          });
          const code = error instanceof AccountError ? error.code : 'failed';
          toast.show({ label: t(ACCOUNT_ERROR_KEYS[code]), variant: 'danger' });
        })
      }
      purpose="expired"
    />
  );
}
