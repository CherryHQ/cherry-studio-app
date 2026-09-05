import CopyrightIcon from '@cherrystudio/app-icons/icons/copyright';
import GithubIcon from '@cherrystudio/app-icons/icons/github';
import GlobeIcon from '@cherrystudio/app-icons/icons/globe';
import MailIcon from '@cherrystudio/app-icons/icons/mail';
import MessageSquareTextIcon from '@cherrystudio/app-icons/icons/message-square-text';
import RssIcon from '@cherrystudio/app-icons/icons/rss';
import { Chip, Image, Section } from '@cherrystudio/ui/components';
import Constants from 'expo-constants';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

import { SettingsScrollPage } from '../components/SettingsScrollPage';

const APP_VERSION = Constants.expoConfig?.version ?? 'latest';
// Exact desktop `src/renderer/assets/images/logo.png`; the launcher icon is a
// separate build asset with platform-safe transparent corners.
const ABOUT_APP_LOGO = require('@/assets/cherry-studio-logo.png');
const ABOUT_LINKS = {
  contact: 'https://docs.cherry-ai.com/contact-us/questions/',
  feedback: 'https://github.com/CherryHQ/cherry-studio-app/issues/',
  license: 'https://github.com/CherryHQ/cherry-studio/blob/main/LICENSE/',
  releases: 'https://github.com/CherryHQ/cherry-studio-app/releases/',
  repository: 'https://github.com/CherryHQ/cherry-studio-app',
  website: 'https://www.cherry-ai.com/',
} as const;

export default function AboutSettingsScreen() {
  const { t } = useTranslation();

  const openLink = useCallback((url: string) => {
    void openExternalUrl(url);
  }, []);

  return (
    <SettingsScrollPage
      contentClassName="gap-6"
      headerProps={{ title: t('settings.about.header') }}
    >
      <View className="flex-row gap-4 rounded-2xl bg-card px-4 py-5">
        <Image
          accessibilityIgnoresInvertColors
          className="border border-border"
          source={ABOUT_APP_LOGO}
          style={{ borderRadius: 36, height: 72, width: 72 }}
        />
        <View className="min-w-0 flex-1 gap-1 py-0.5">
          <Text className="font-bold text-[22px] text-foreground" numberOfLines={1}>
            {t('common.cherryStudio')}
          </Text>
          <Text className="text-foreground text-sm" numberOfLines={0}>
            {t('common.cherryStudioDescription')}
          </Text>
          <Chip.Tag className="px-2 py-0.5">{`v${APP_VERSION}`}</Chip.Tag>
        </View>
      </View>

      <Section title={t('settings.about.title')}>
        <Section.Item
          label={t('settings.about.repository.title')}
          leading={<GithubIcon className="size-[18px] text-foreground" />}
          onPress={() => openLink(ABOUT_LINKS.repository)}
          showChevron={false}
        />
        <Section.Item
          label={t('settings.about.releases.title')}
          leading={<RssIcon className="size-[18px] text-foreground" />}
          onPress={() => openLink(ABOUT_LINKS.releases)}
          showChevron={false}
        />
        <Section.Item
          label={t('settings.about.website.title')}
          leading={<GlobeIcon className="size-[18px] text-foreground" />}
          onPress={() => openLink(ABOUT_LINKS.website)}
          showChevron={false}
        />
        <Section.Item
          label={t('settings.about.feedback.title')}
          leading={<MessageSquareTextIcon className="size-[18px] text-foreground" />}
          onPress={() => openLink(ABOUT_LINKS.feedback)}
          showChevron={false}
        />
        <Section.Item
          label={t('settings.about.license.title')}
          leading={<CopyrightIcon className="size-[18px] text-foreground" />}
          onPress={() => openLink(ABOUT_LINKS.license)}
          showChevron={false}
        />
        <Section.Item
          label={t('settings.about.contact.title')}
          leading={<MailIcon className="size-[18px] text-foreground" />}
          onPress={() => openLink(ABOUT_LINKS.contact)}
          showChevron={false}
        />
      </Section>
    </SettingsScrollPage>
  );
}
