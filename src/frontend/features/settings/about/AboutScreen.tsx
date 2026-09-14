import GithubIcon from '@cherrystudio/app-icons/icons/github';
import GlobeIcon from '@cherrystudio/app-icons/icons/globe';
import MailIcon from '@cherrystudio/app-icons/icons/mail';
import MessageSquareTextIcon from '@cherrystudio/app-icons/icons/message-square-text';
import { Image, Section, useToast } from '@cherrystudio/ui/components';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, Text, View } from 'react-native';

import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

import { SettingsScrollPage } from '../components/SettingsScrollPage';

const APP_VERSION = Constants.expoConfig?.version?.trim();
const APP_BUILD = Platform.select({
  android: Constants.expoConfig?.android?.versionCode?.toString(),
  ios: Constants.platform?.ios?.buildNumber ?? Constants.expoConfig?.ios?.buildNumber,
});
const APP_PROFILE = Constants.expoConfig?.extra?.sentryEnvironment;
const SUPPORT_EMAIL = 'support@cherry-ai.com';
// Exact desktop `src/renderer/assets/images/logo.png`; the launcher icon is a
// separate build asset with platform-safe transparent corners.
const ABOUT_APP_LOGO = require('@/assets/cherry-studio-logo.png');
const ABOUT_LINKS = {
  feedback: 'https://github.com/CherryHQ/cherry-studio-app/issues/new/choose',
  repository: 'https://github.com/CherryHQ/cherry-studio-app',
  website: 'https://www.cherry-ai.com/',
} as const;

export default function AboutSettingsScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const versionLabel = APP_VERSION ? `v${APP_VERSION}` : t('settings.about.version.unknown');
  const buildLabel = APP_BUILD ? t('settings.about.version.build', { build: APP_BUILD }) : null;
  const environmentLabel =
    __DEV__ || APP_PROFILE === 'development'
      ? t('settings.about.version.development')
      : APP_PROFILE === 'preview'
        ? t('settings.about.version.preview')
        : null;
  const versionDetails = [versionLabel, environmentLabel, buildLabel].filter(Boolean).join(' · ');
  const systemDetails = [Device.osName ?? Platform.OS, Device.osVersion].filter(Boolean).join(' ');

  const openLink = useCallback((url: string) => {
    void openExternalUrl(url);
  }, []);

  const openFeedback = () => {
    const params = new URLSearchParams({
      'os-version': systemDetails,
      version: versionDetails,
    });
    if (Device.modelName) {
      params.set('device', Device.modelName);
    }
    openLink(`${ABOUT_LINKS.feedback}?${params.toString()}`);
  };

  const openEmail = () => {
    const subject = encodeURIComponent(t('settings.about.contact.subject'));
    const body = encodeURIComponent(
      t('settings.about.contact.body', { system: systemDetails, version: versionDetails }),
    );
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`).catch(() => {
      toast.show({
        label: t('settings.about.contact.failed', { email: SUPPORT_EMAIL }),
        variant: 'danger',
      });
    });
  };

  return (
    <SettingsScrollPage
      contentClassName="gap-6"
      headerProps={{
        rightActions: [
          {
            accessibilityLabel: t('settings.about.repository.title'),
            icon: GithubIcon,
            key: 'repository',
            onPress: () => openLink(ABOUT_LINKS.repository),
            type: 'icon',
          },
        ],
        title: t('settings.about.header'),
      }}
    >
      <View className="flex-row items-center gap-4 rounded-2xl bg-card px-4 py-5">
        <Image
          accessibilityIgnoresInvertColors
          className="size-18 shrink-0 rounded-full border border-border"
          source={ABOUT_APP_LOGO}
        />
        <View className="min-w-0 flex-1 gap-2">
          <Text className="text-xl font-semibold text-foreground">{t('common.cherryStudio')}</Text>
          <Text className="text-sm text-muted-foreground">{versionLabel}</Text>
        </View>
      </View>

      <Section>
        <Section.Item
          accessibilityHint={t('settings.about.feedback.description')}
          accessibilityRole="link"
          label={t('settings.about.feedback.title')}
          leading={<MessageSquareTextIcon className="size-4 text-foreground" />}
          onPress={openFeedback}
        />
        <Section.Item
          label={t('settings.about.contact.title')}
          leading={<MailIcon className="size-4 text-foreground" />}
          onPress={openEmail}
        />
        <Section.Item
          accessibilityRole="link"
          label={t('settings.about.website.title')}
          leading={<GlobeIcon className="size-4 text-foreground" />}
          onPress={() => openLink(ABOUT_LINKS.website)}
        />
      </Section>
    </SettingsScrollPage>
  );
}
