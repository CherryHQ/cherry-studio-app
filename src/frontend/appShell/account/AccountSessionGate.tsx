import { ContentState, useToast } from '@cherrystudio/ui/components';
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
  if (state.isRestoringSession)
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
          const code = error instanceof AccountError ? error.code : 'connection';
          toast.show({ label: t(ACCOUNT_ERROR_KEYS[code]), variant: 'danger' });
        })
      }
      purpose="expired"
    />
  );
}
