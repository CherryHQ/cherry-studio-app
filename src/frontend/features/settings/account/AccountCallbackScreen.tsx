import { ContentState, useToast } from '@cherrystudio/ui/components';
import { clearInitialURL, useLinkingURL } from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ACCOUNT_ERROR_KEYS, useAccount } from '@/frontend/appShell/account';
import { AccountError } from '@/shared/contracts/account';

/** Handles cold starts as well as a deep link delivered alongside the live auth browser. */
export function AccountCallbackScreen() {
  const url = useLinkingURL();
  const { account } = useAccount();
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();
  const handled = useRef(false);

  useEffect(() => {
    if (!url || handled.current) return;
    handled.current = true;
    // Capture before clearing so a profile reload cannot redeem this one-use callback again.
    clearInitialURL();
    void account.receiveRedirect(url).then(
      (stayed) => {
        if (stayed) router.replace('/');
      },
      (error: unknown) => {
        toast.show({
          label: t(ACCOUNT_ERROR_KEYS[error instanceof AccountError ? error.code : 'connection']),
          variant: 'danger',
        });
        router.replace('/settings/profile');
      },
    );
  }, [url, account, router, toast, t]);

  return (
    <View className="flex-1 justify-center">
      <ContentState.Loading title={t('account.returning')} />
    </View>
  );
}
