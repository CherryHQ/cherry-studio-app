import { ContentState } from '@cherrystudio/ui/components';
import { clearInitialURL, useLinkingURL } from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useAccount, useAccountErrorReporter } from '@/frontend/appShell/account';

/** Handles cold starts as well as a deep link delivered alongside the live auth browser. */
export function AccountCallbackScreen() {
  const url = useLinkingURL();
  const { account } = useAccount();
  const router = useRouter();
  const reportError = useAccountErrorReporter('AccountCallback');
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
        reportError(error, 'account.callback');
        router.replace('/settings/profile');
      },
    );
  }, [url, account, router, reportError]);

  return (
    <View className="flex-1 justify-center">
      <ContentState.Loading title={t('account.returning')} />
    </View>
  );
}
