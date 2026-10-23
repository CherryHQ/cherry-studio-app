import { ContentState } from '@cherrystudio/ui/components';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { LoginScreen } from './LoginScreen';
import { useAccount } from './useAccount';

/** Enterprise data is shown only after the restored session matches its profile. */
export function AccountSessionGate({ children }: PropsWithChildren) {
  const { t } = useTranslation();
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
      expired
      secondaryAction={{ label: t('account.useLocal'), onPress: () => void account.useLocal() }}
    />
  );
}
