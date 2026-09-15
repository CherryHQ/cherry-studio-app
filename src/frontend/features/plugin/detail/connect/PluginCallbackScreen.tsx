import { ContentState, useToast } from '@cherrystudio/ui/components';
import { clearInitialURL, useLinkingURL } from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data';
import { PluginError } from '@/shared/contracts/plugins';
import { PluginIdSchema } from '@/shared/data/types/plugin';

/** Navigation fallback only. The method runtime consumes and validates the original URL. */
export function PluginCallbackScreen() {
  const { pluginId } = useLocalSearchParams<{ pluginId: string }>();
  const url = useLinkingURL();
  const plugins = useBackendModule('plugins');
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const parsed = PluginIdSchema.safeParse(pluginId);
    clearInitialURL();
    // Remove the callback query from navigation before any token exchange or network wait.
    if (!parsed.success) {
      router.replace('/plugins');
      return;
    }
    router.dismissTo({
      pathname: '/plugins/[pluginId]/connect',
      params: { pluginId: parsed.data },
    });
    if (!url) return;
    void plugins.authorization.receiveRedirect(parsed.data, url).catch((error: unknown) => {
      toast.show({
        label: t(`plugins.errors.${error instanceof PluginError ? error.reason : 'request'}`),
        variant: 'danger',
      });
    });
  }, [url, pluginId, plugins, router, toast, t]);

  return <ContentState.Loading title={t('plugins.authorization.returning')} />;
}
