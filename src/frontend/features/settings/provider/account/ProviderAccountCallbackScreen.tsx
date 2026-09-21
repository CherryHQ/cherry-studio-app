import { ContentState, useToast } from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { clearInitialURL, useLinkingURL } from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data';
import { ProviderAccountError } from '@/shared/contracts';

import { refreshAccountProvider } from '../components/ProviderAccount';

export function ProviderAccountCallbackScreen() {
  const url = useLinkingURL();
  const accounts = useBackendModule('providers').accounts;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    clearInitialURL();
    const returnToForm = router.canGoBack();
    // Capture the original URL, then remove codes and state from navigation before exchanging them.
    if (returnToForm) router.back();
    else router.replace('/settings/provider');
    if (!url) return;
    void accounts
      .receiveRedirect(url)
      .then(async (providerId) => {
        if (!providerId) return;
        await refreshAccountProvider(queryClient, accounts, providerId);
        if (!returnToForm) {
          router.replace({ pathname: '/settings/provider/[providerId]', params: { providerId } });
        }
      })
      .catch((error: unknown) => {
        toast.show({
          label: t(
            `settings.provider.account.errors.${error instanceof ProviderAccountError ? error.reason : 'request'}`,
          ),
          variant: 'danger',
        });
      });
  }, [url, accounts, router, queryClient, toast, t]);

  return <ContentState.Loading title={t('settings.provider.account.returning')} />;
}
