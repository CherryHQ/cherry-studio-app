import GithubIcon from '@cherrystudio/app-icons/icons/github';
import GlobeIcon from '@cherrystudio/app-icons/icons/globe';
import HistoryIcon from '@cherrystudio/app-icons/icons/history';
import MailIcon from '@cherrystudio/app-icons/icons/mail';
import MessageSquareTextIcon from '@cherrystudio/app-icons/icons/message-square-text';
import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import { Chip, Image, Section, useToast } from '@cherrystudio/ui/components';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, Text, View } from 'react-native';

import { useAppUpdateEntry } from '@/frontend/appShell/appUpdate';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

import { SettingsScrollPage } from '../components/SettingsScrollPage';

const APP_VERSION = Application.nativeApplicationVersion?.trim();
const APP_BUILD = Application.nativeBuildVersion;
const APP_PROFILE = Constants.expoConfig?.extra?.sentryEnvironment;
const SUPPORT_EMAIL = 'support@cherry-ai.com';
// Exact desktop `src/renderer/assets/images/logo.png`; the launcher icon is a
// separate build asset with platform-safe transparent corners.
const ABOUT_APP_LOGO = require('@/assets/cherry-studio-logo.png');
const ABOUT_LINKS = {
  repository: 'https://github.com/CherryHQ/cherry-studio-app',
  website: 'https://www.cherry-ai.com/',
} as const;

export default function AboutSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { checkForUpdates, hasAvailableUpdate, isEnabled, isFetching } = useAppUpdateEntry();
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
    <>
      <SettingsScrollPage
        contentClassName="gap-4"
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
        <View className="items-center gap-4 py-6">
          <Image
            accessibilityIgnoresInvertColors
            className="size-20 rounded-2xl"
            source={ABOUT_APP_LOGO}
          />
          <View className="items-center gap-1">
            <Text className="text-xl font-semibold text-foreground">
              {t('common.cherryStudio')}
            </Text>
            <Text className="text-center text-sm text-muted-foreground">{versionDetails}</Text>
          </View>
        </View>

        <Section>
          {isEnabled ? (
            <Section.Item
              accessibilityHint={hasAvailableUpdate ? t('appUpdate.confirmTitle') : undefined}
              accessibilityState={{ busy: isFetching }}
              label={t('appUpdate.check')}
              leading={<RefreshCwIcon className="size-4 text-foreground" />}
              onPress={() => void checkForUpdates()}
              showChevron={false}
              testID="settings-check-update"
              trailing={
                hasAvailableUpdate ? (
                  <Chip.Tag className="px-2 py-0.5" testID="settings-update-new">
                    <Chip.Label className="text-xs">{t('appUpdate.newBadge')}</Chip.Label>
                  </Chip.Tag>
                ) : undefined
              }
            />
          ) : null}
          <Section.Item
            accessibilityHint={t('settings.about.feedback.description')}
            label={t('settings.about.feedback.title')}
            leading={<MessageSquareTextIcon className="size-4 text-foreground" />}
            onPress={() => router.push('/settings/about/feedback/new')}
            showChevron={false}
          />
          <Section.Item
            label={t('settings.about.feedback.history.title')}
            leading={<HistoryIcon className="size-4 text-foreground" />}
            onPress={() => router.push('/settings/about/feedback')}
            testID="feedback-history-entry"
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
    </>
  );
}
