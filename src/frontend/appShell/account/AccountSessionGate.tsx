import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';

import { LoginScreen } from './LoginScreen';
import { useAccount } from './useAccount';

/** An enterprise profile whose session the server rejected returns to sign-in; its data stays. */
export function AccountSessionGate({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const { account, state } = useAccount();
  if (!state.isEnterprise || !state.needsSignIn) return children;
  return (
    <LoginScreen
      expired
      secondaryAction={{ label: t('account.useLocal'), onPress: () => void account.useLocal() }}
    />
  );
}
