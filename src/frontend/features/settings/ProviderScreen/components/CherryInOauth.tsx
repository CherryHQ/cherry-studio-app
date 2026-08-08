import { Button, Section } from '@cherrystudio/ui/components';
import { resolveProviderIcon } from '@cherrystudio/ui/icons/providers';
import { useToast } from 'heroui-native/toast';
import { LogInIcon, LogOutIcon, WalletIcon } from 'lucide-uniwind/png';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { useAppAlert } from '@/frontend/components/AppAlertProvider';
import { Image } from '@/frontend/components/nativePrimitives';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

import { UserCancelledError, useCherryInOauth } from '../hooks/useCherryInOauth';

const CHERRYIN_TOPUP_URL = 'https://open.cherryin.ai/console/topup';

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }
  return `$${value.toFixed(2)}`;
}

type CherryInOauthProps = {
  providerId: string;
  onOAuthComplete?: () => void;
};

export function CherryInOauth({ providerId, onOAuthComplete }: CherryInOauthProps) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const { showConfirmation } = useAppAlert();
  const iconTheme = theme === 'dark' ? 'dark' : 'light';
  const providerIcon = resolveProviderIcon('cherryin');
  const { toast } = useToast();
  const requestLogoutConfirmation = useCallback(
    ({ message, onConfirm, title }: { message: string; onConfirm: () => void; title: string }) => {
      showConfirmation({
        confirmLabel: t('settings.provider.oauth.cherryIn.logout'),
        description: message,
        onConfirm,
        role: 'destructive',
        title,
      });
    },
    [showConfirmation, t],
  );

  const {
    provider,
    hasOAuthToken,
    balance,
    authConfigQuery,
    providerQuery,
    isReady,
    isLoadingData,
    isLoggingOut,
    isLoggingIn,
    handleOAuthLogin,
    handleLogout,
    fetchData,
  } = useCherryInOauth({
    onOAuthComplete,
    providerId,
    requestConfirmation: requestLogoutConfirmation,
  });

  const onLoginPress = useCallback(async () => {
    try {
      await handleOAuthLogin();
    } catch (error) {
      if (error instanceof UserCancelledError) {
        return;
      }
      const message = error instanceof Error ? error.message : 'OAuth failed';
      toast.show({
        label: t('settings.provider.oauth.cherryIn.error'),
        description: message,
        variant: 'danger',
      });
    }
  }, [handleOAuthLogin, t, toast]);

  const handleTopup = useCallback(() => {
    void openExternalUrl(CHERRYIN_TOPUP_URL);
  }, []);

  // Loading state
  if (authConfigQuery.isPending || providerQuery.isPending) {
    return (
      <View className="gap-2 rounded-2xl border border-border bg-background px-4 py-4">
        <View className="h-5 w-55 rounded bg-secondary" />
        <View className="mt-2 h-4 w-full rounded bg-secondary" />
      </View>
    );
  }

  // Provider not found
  if (!provider) {
    return null;
  }

  // Logged-out state
  if (!hasOAuthToken) {
    return (
      <Section>
        <Section.Item>
          <View className="gap-3">
            <View className="flex-row items-center gap-3">
              {providerIcon?.[iconTheme] ? (
                <Image className="h-9 w-9 rounded-xl" source={providerIcon[iconTheme]} />
              ) : (
                <Text>{provider.name[0]}</Text>
              )}
              <View className="flex-1">
                <Text className="text-sm font-medium text-foreground">
                  {t('settings.provider.oauth.cherryIn.account_title')}
                </Text>
                <Text className="mt-0.5 text-foreground text-xs">
                  {t('settings.provider.oauth.cherryIn.tagline')}
                </Text>
              </View>
            </View>
            <Button
              className="w-full"
              disabled={!isReady || isLoggingIn}
              icon={<LogInIcon />}
              loading={isLoggingIn}
              onPress={onLoginPress}
            >
              {t('settings.provider.oauth.cherryIn.login_button')}
            </Button>
          </View>
        </Section.Item>
      </Section>
    );
  }

  // Logged-in state
  return (
    <Section
      footer={
        <Text
          accessibilityRole="link"
          className="px-3 text-xs text-foreground-tertiary underline"
          onPress={() => void openExternalUrl('https://open.cherryin.ai')}
        >
          {t('settings.provider.oauth.cherryIn.service_attribution')}
        </Text>
      }
    >
      <Section.Item>
        <View className="flex-row items-center justify-between">
          <View className="min-w-0 flex-1 flex-row items-center">
            {providerIcon?.[iconTheme] ? (
              <Image className="h-15 w-15 rounded-xl" source={providerIcon[iconTheme]} />
            ) : (
              <Text>{provider.name[0]}</Text>
            )}

            <View className="ml-2 min-w-0 flex-1 gap-1">
              <Text className="font-semibold text-base text-foreground">{provider.name}</Text>
              <View className="flex-row flex-wrap gap-3">
                <Button disabled={isLoadingData} onPress={fetchData} size="sm" variant="ghost">
                  <View className="flex-row items-center gap-1">
                    <Text className="text-sm text-foreground">
                      {t('settings.provider.oauth.cherryIn.balance')}
                    </Text>
                    <Text className="text-sm text-foreground">
                      {isLoadingData && balance === null ? '···' : formatCurrency(balance)}
                    </Text>
                  </View>
                </Button>
                <Button icon={<WalletIcon />} onPress={handleTopup} size="sm">
                  {t('settings.provider.oauth.cherryIn.topup')}
                </Button>
              </View>
            </View>
          </View>

          <Button
            accessibilityLabel={t('settings.provider.oauth.cherryIn.logout')}
            className="h-9 w-9 min-w-0 rounded-full bg-transparent p-0"
            disabled={isLoggingOut}
            icon={<LogOutIcon />}
            loading={isLoggingOut}
            onPress={handleLogout}
            variant="ghost"
          />
        </View>
      </Section.Item>
    </Section>
  );
}
