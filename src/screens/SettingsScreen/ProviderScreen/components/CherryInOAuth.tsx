import { resolveProviderIcon } from '@cherrystudio/ui/icons-png/providers';
import { Button, Card, Spinner, useToast } from 'heroui-native';
import { LogInIcon, LogOutIcon, WalletIcon } from 'lucide-uniwind';
import { Fragment, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Linking, Text, View } from 'react-native';
import { useUniwind } from 'uniwind';
import {
  UserCancelledError,
  useCherryInOAuth,
} from '@/hooks/features/cherryin-auth/useCherryInOAuth';
import { useSettingsConfirmDialog } from '../../hooks/useSettingsConfirmDialog';

const CHERRYIN_TOPUP_URL = 'https://open.cherryin.ai/console/topup';

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }
  return `$${value.toFixed(2)}`;
}

type CherryInOAuthProps = {
  providerId: string;
  onOAuthComplete?: () => void;
};

export function CherryInOAuth({ providerId, onOAuthComplete }: CherryInOAuthProps) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const { confirmDialog, requestConfirm } = useSettingsConfirmDialog();
  const iconTheme = theme === 'dark' ? 'dark' : 'light';
  const providerIcon = resolveProviderIcon('cherryin');
  const { toast } = useToast();

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
  } = useCherryInOAuth({ providerId, requestConfirm, onOAuthComplete });

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
    Linking.openURL(CHERRYIN_TOPUP_URL);
  }, []);

  // Loading state
  if (authConfigQuery.isPending || providerQuery.isPending) {
    return (
      <Fragment>
        <View className="gap-2 rounded-2xl border border-default-200 bg-background px-4 py-4">
          <View className="h-5 w-55 rounded bg-default-100" />
          <View className="mt-2 h-4 w-full rounded bg-default-100" />
        </View>
        {confirmDialog}
      </Fragment>
    );
  }

  // Provider not found
  if (!provider) {
    return <Fragment>{confirmDialog}</Fragment>;
  }

  // Logged-out state
  if (!hasOAuthToken) {
    return (
      <Fragment>
        <Card className="gap-3 p-2">
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
              <Text className="mt-0.5 text-xs text-default-400">
                {t('settings.provider.oauth.cherryIn.tagline')}
              </Text>
            </View>
          </View>
          <Button
            className="w-full justify-center gap-2 px-4 h-10"
            isDisabled={!isReady || isLoggingIn}
            onPress={onLoginPress}
          >
            {isLoggingIn ? (
              <Spinner color="white" size="sm" />
            ) : (
              <>
                <LogInIcon size={15} color="white" />
                <Button.Label className="text-md text-white">
                  {t('settings.provider.oauth.cherryIn.login_button')}
                </Button.Label>
              </>
            )}
          </Button>
        </Card>
        {confirmDialog}
      </Fragment>
    );
  }

  // Logged-in state
  return (
    <Fragment>
      <Card>
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            {providerIcon?.[iconTheme] ? (
              <Image className="h-15 w-15 rounded-xl" source={providerIcon[iconTheme]} />
            ) : (
              <Text>{provider.name[0]}</Text>
            )}

            <View className="ml-2 gap-1">
              <Text className="font-semibold text-base">{provider.name}</Text>
              <View className="flex flex-row gap-3">
                <Button isDisabled={isLoadingData} onPress={fetchData} variant="tertiary" size="sm">
                  <Button.Label className="p-0">
                    <Text className="text-sm">{t('settings.provider.oauth.cherryIn.balance')}</Text>
                    <Text className="text-sm">
                      {isLoadingData && balance === null ? '···' : formatCurrency(balance)}
                    </Text>
                  </Button.Label>
                </Button>
                <Button onPress={handleTopup} variant="primary" size="sm">
                  <View className="flex flex-row items-center gap-1.5">
                    <WalletIcon size={15} color="white" />
                    <Button.Label>
                      <Text className="text-sm">{t('settings.provider.oauth.cherryIn.topup')}</Text>
                    </Button.Label>
                  </View>
                </Button>
              </View>
            </View>
          </View>

          <View className="flex-row items-center gap-1">
            <Button
              className="h-9 w-9 min-w-0 rounded-full bg-transparent p-0"
              isDisabled={isLoggingOut}
              onPress={handleLogout}
              variant="ghost"
            >
              <LogOutIcon size={15} />
            </Button>
          </View>
        </View>
        <Card.Footer className="mt-2">
          <Text
            accessibilityRole="link"
            className="text-xs text-default-400 underline"
            onPress={() => Linking.openURL('https://open.cherryin.ai')}
          >
            {t('settings.provider.oauth.cherryIn.service_attribution')}
          </Text>
        </Card.Footer>
      </Card>
      {confirmDialog}
    </Fragment>
  );
}
