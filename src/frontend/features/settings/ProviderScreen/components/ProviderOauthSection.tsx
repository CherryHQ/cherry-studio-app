import {
  CircleAlertIcon,
  CircleDollarSignIcon,
  CopyIcon,
  ExternalLinkIcon,
  ReceiptTextIcon,
  XIcon,
} from '@cherrystudio/app-icons';
import { Button, Image, Section, useAlert } from '@cherrystudio/ui/components';
import { resolveProviderIcon } from '@cherrystudio/ui/icons/providers';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import * as Clipboard from 'expo-clipboard';
import type { ReactNode } from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

import {
  type ProviderOauthController,
  UserCancelledError,
  useProviderOauth,
} from '../hooks/useProviderOauth';

const PROVIDER_ACCOUNT_LINKS: Record<string, { bills: string; charge: string }> = {
  '302ai': {
    bills: 'https://dash.302.ai/charge',
    charge: 'https://dash.302.ai/charge',
  },
  aihubmix: {
    bills: 'https://console.inferera.com/statistics?client_id=cherry_studio_oauth&aff=SJyh',
    charge: 'https://console.inferera.com/topup?client_id=cherry_studio_oauth&aff=SJyh',
  },
  aionly: {
    bills: 'https://maas.aiionly.com/billManagement',
    charge: 'https://maas.aiionly.com/recharge',
  },
  ppio: {
    bills:
      'https://ppio.com/user/register?invited_by=JYT9GD&utm_source=github_cherry-studio&redirect=/billing/billing-details',
    charge:
      'https://ppio.com/user/register?invited_by=JYT9GD&utm_source=github_cherry-studio&redirect=/billing',
  },
  silicon: {
    bills: 'https://cloud.siliconflow.cn/bills',
    charge: 'https://cloud.siliconflow.cn/expensebill',
  },
};

type ProviderOauthSectionProps = {
  provider: Provider;
};

export function ProviderOauthSection({ provider }: ProviderOauthSectionProps) {
  const oauth = useProviderOauth(provider.id);
  return <ProviderOauthSectionView oauth={oauth} provider={provider} />;
}

type ProviderOauthSectionViewProps = ProviderOauthSectionProps & {
  authenticatedContent?: ReactNode;
  identityDetail?: ReactNode;
  oauth: ProviderOauthController;
};

export function ProviderOauthSectionView({
  authenticatedContent,
  identityDetail,
  oauth,
  provider,
}: ProviderOauthSectionViewProps) {
  const { alert } = useAlert();
  const { i18n, t } = useTranslation();
  const { theme } = useUniwind();
  const providerIcon = resolveProviderIcon(provider.id);
  const iconSource = providerIcon?.[theme === 'dark' ? 'dark' : 'light'];
  const accountLinks = resolveProviderAccountLinks(provider.id, i18n.language);

  const handleLogin = useCallback(async () => {
    try {
      await oauth.login();
    } catch (error) {
      if (error instanceof UserCancelledError) return;
      alert.show({
        description: error instanceof Error ? error.message : t('settings.provider.oauth.error'),
        title: t('settings.provider.oauth.error'),
      });
    }
  }, [alert, oauth, t]);

  const requestLogout = useCallback(() => {
    alert.confirm({
      confirmLabel: t('settings.provider.oauth.logout'),
      description: t('settings.provider.oauth.logoutConfirm', { provider: provider.name }),
      onConfirm: () =>
        void oauth.logout().catch((error: unknown) => {
          alert.show({
            description: error instanceof Error ? error.message : undefined,
            title: t('settings.provider.oauth.logoutFailed'),
          });
        }),
      role: 'destructive',
      title: t('settings.provider.oauth.logout'),
    });
  }, [alert, oauth, provider.name, t]);

  if (oauth.statusQuery.isPending) {
    return (
      <Section contentClassName="bg-field">
        <Section.Item>
          <View className="gap-2 py-1">
            <View className="h-5 w-40 rounded bg-secondary" />
            <View className="h-4 w-full rounded bg-secondary" />
          </View>
        </Section.Item>
      </Section>
    );
  }

  if (!oauth.status || oauth.statusQuery.isError) {
    return null;
  }

  if (oauth.status.flowType === 'blocked' || !oauth.status.isConfigured) {
    const message =
      oauth.status.flowType === 'blocked'
        ? t('settings.provider.oauth.blockedMobile')
        : t(`settings.provider.oauth.configuration.${oauth.status.configurationIssue}`);
    return (
      <Section contentClassName="bg-field">
        <Section.Item>
          <View className="flex-row items-start gap-3 py-1">
            <CircleAlertIcon />
            <View className="min-w-0 flex-1 gap-1">
              <Text className="font-medium text-secondary-foreground">{provider.name}</Text>
              <Text selectable className="text-secondary-foreground text-sm">
                {message}
              </Text>
            </View>
          </View>
        </Section.Item>
      </Section>
    );
  }

  if (oauth.deviceAuthorization) {
    return (
      <Section contentClassName="bg-field">
        <Section.Item>
          <View className="gap-3">
            <ProviderIdentity iconSource={iconSource} provider={provider} />
            <Text className="text-secondary-foreground text-sm">
              {t('settings.provider.oauth.deviceCodeDescription')}
            </Text>
            <View className="flex-row items-center gap-2 rounded-lg bg-secondary px-3 py-2">
              <Text
                selectable
                className="min-w-0 flex-1 font-semibold text-secondary-foreground text-lg"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {oauth.deviceAuthorization.userCode}
              </Text>
              <Button
                accessibilityLabel={t('common.copy')}
                className="h-9 w-9 min-w-0 p-0"
                icon={<CopyIcon />}
                onPress={() =>
                  void Clipboard.setStringAsync(oauth.deviceAuthorization?.userCode ?? '')
                }
                variant="ghost"
              />
            </View>
            <View className="flex-row gap-2">
              <Button
                className="flex-1"
                icon={<ExternalLinkIcon />}
                onPress={() =>
                  void openExternalUrl(oauth.deviceAuthorization?.verificationUri ?? '')
                }
                variant="secondary"
              >
                {t('settings.provider.oauth.openAuthorization')}
              </Button>
              <Button
                accessibilityLabel={t('common.cancel')}
                className="h-10 w-10 min-w-0 p-0"
                icon={<XIcon />}
                onPress={() => void oauth.cancelAuthorization()}
                variant="ghost"
              />
            </View>
          </View>
        </Section.Item>
      </Section>
    );
  }

  if (!oauth.status.isAuthenticated) {
    return (
      <Section contentClassName="bg-field">
        <Section.Item>
          <View className="flex-row items-center gap-3">
            <ProviderIdentity iconSource={iconSource} provider={provider} />
            <View className="flex-1" />
            <Button
              disabled={oauth.isLoggingIn}
              loading={oauth.isLoggingIn}
              onPress={() => void handleLogin()}
              size="sm"
            >
              {t('settings.provider.oauth.login')}
            </Button>
          </View>
        </Section.Item>
      </Section>
    );
  }

  return (
    <Section contentClassName="bg-field">
      <Section.Item>
        <View className="gap-3">
          <View className="flex-row items-center gap-3">
            <ProviderIdentity detail={identityDetail} iconSource={iconSource} provider={provider} />
            <View className="flex-1" />
            {authenticatedContent}
            <Button
              accessibilityLabel={t('settings.provider.oauth.logout')}
              disabled={oauth.isLoggingOut}
              loading={oauth.isLoggingOut}
              onPress={requestLogout}
              size="sm"
              variant="secondary"
            >
              {t('settings.provider.oauth.logout')}
            </Button>
          </View>
          {oauth.status.accountId ? (
            <Text selectable className="text-secondary-foreground text-sm">
              {oauth.status.accountId}
            </Text>
          ) : null}
          {accountLinks ? (
            <View className="flex-row gap-2">
              <Button
                className="flex-1"
                icon={<CircleDollarSignIcon />}
                onPress={() => void openExternalUrl(accountLinks.charge)}
                size="sm"
              >
                {t('settings.provider.oauth.charge')}
              </Button>
              <Button
                className="flex-1"
                icon={<ReceiptTextIcon />}
                onPress={() => void openExternalUrl(accountLinks.bills)}
                size="sm"
                variant="secondary"
              >
                {t('settings.provider.oauth.bills')}
              </Button>
            </View>
          ) : null}
        </View>
      </Section.Item>
    </Section>
  );
}

function resolveProviderAccountLinks(
  providerId: string,
  language: string,
): { bills: string; charge: string } | undefined {
  const links = PROVIDER_ACCOUNT_LINKS[providerId];
  if (!links || providerId !== 'aihubmix') return links;

  const lang = language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
  const withLanguage = (value: string) => {
    const url = new URL(value);
    url.searchParams.set('lang', lang);
    return url.toString();
  };
  return { bills: withLanguage(links.bills), charge: withLanguage(links.charge) };
}

function ProviderIdentity({
  detail,
  iconSource,
  provider,
}: {
  detail?: ReactNode;
  iconSource: ReturnType<typeof resolveProviderIcon> extends infer T
    ? T extends Record<string, infer TSource>
      ? TSource | undefined
      : never
    : never;
  provider: Provider;
}) {
  return (
    <View className="min-w-0 shrink flex-row items-center gap-3">
      {iconSource ? (
        <Image className="h-10 w-10 rounded-lg" source={iconSource} />
      ) : (
        <View className="h-10 w-10 items-center justify-center rounded-lg bg-secondary">
          <Text className="font-semibold text-secondary-foreground">{provider.name[0]}</Text>
        </View>
      )}
      <View className="min-w-0 shrink">
        <Text className="text-base font-medium text-secondary-foreground" numberOfLines={1}>
          {provider.name}
        </Text>
        {detail}
      </View>
    </View>
  );
}
