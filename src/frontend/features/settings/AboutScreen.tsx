import { Section } from '@cherrystudio/ui/components';
import { PROVIDER_ICONS } from '@cherrystudio/ui/icons/providers';
import Constants from 'expo-constants';
import {
  CodeIcon,
  CopyrightIcon,
  GlobeIcon,
  MailIcon,
  RssIcon,
  SquareArrowOutUpRightIcon,
} from 'lucide-uniwind/png';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { BackHeader } from '@/frontend/components/headers';
import { Image } from '@/frontend/components/nativePrimitives';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

const APP_VERSION = Constants.expoConfig?.version ?? 'latest';
const githubIcon = PROVIDER_ICONS.github;

function GitHubIcon({ className }: { className?: string }) {
  const { theme } = useUniwind();
  const iconTheme = theme === 'dark' ? 'dark' : 'light';
  return <Image className={className} source={githubIcon[iconTheme]} />;
}

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
    <>
      <BackHeader title={t('settings.about.header')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-6 px-4 py-5">
          <View className="flex-row gap-4 rounded-2xl bg-vbg-gray-100 px-4 py-5">
            <Image
              accessibilityIgnoresInvertColors
              source={require('@/assets/icon.png')}
              style={{ borderRadius: 18, height: 72, width: 72 }}
            />
            <View className="min-w-0 flex-1 gap-1 py-0.5">
              <Text className="font-bold text-[22px] text-foreground" numberOfLines={1}>
                {t('common.cherryStudio')}
              </Text>
              <Text className="text-default-foreground text-sm" numberOfLines={0}>
                {t('common.cherryStudioDescription')}
              </Text>
              <View className="self-start rounded-full bg-primary/10 px-2 py-0.5">
                <Text className="font-medium text-primary text-sm">v{APP_VERSION}</Text>
              </View>
            </View>
          </View>

          <Section title={t('settings.about.title')}>
            <Section.Item
              label={t('settings.about.repository.title')}
              leading={<GitHubIcon className="size-5" />}
              onPress={() => openLink(ABOUT_LINKS.repository)}
              trailing={
                <SquareArrowOutUpRightIcon
                  className="size-5 text-default-foreground"
                  strokeWidth={2}
                />
              }
            />
            <Section.Item
              label={t('settings.about.releases.title')}
              leading={<RssIcon className="size-5 text-foreground" strokeWidth={2} />}
              onPress={() => openLink(ABOUT_LINKS.releases)}
              trailing={
                <SquareArrowOutUpRightIcon
                  className="size-5 text-default-foreground"
                  strokeWidth={2}
                />
              }
            />
            <Section.Item
              label={t('settings.about.website.title')}
              leading={<GlobeIcon className="size-5 text-foreground" strokeWidth={2} />}
              onPress={() => openLink(ABOUT_LINKS.website)}
              trailing={
                <SquareArrowOutUpRightIcon
                  className="size-5 text-default-foreground"
                  strokeWidth={2}
                />
              }
            />
            <Section.Item
              label={t('settings.about.feedback.title')}
              leading={<CodeIcon className="size-5 text-foreground" strokeWidth={2} />}
              onPress={() => openLink(ABOUT_LINKS.feedback)}
              trailing={
                <SquareArrowOutUpRightIcon
                  className="size-5 text-default-foreground"
                  strokeWidth={2}
                />
              }
            />
            <Section.Item
              label={t('settings.about.license.title')}
              leading={<CopyrightIcon className="size-5 text-foreground" strokeWidth={2} />}
              onPress={() => openLink(ABOUT_LINKS.license)}
              trailing={
                <SquareArrowOutUpRightIcon
                  className="size-5 text-default-foreground"
                  strokeWidth={2}
                />
              }
            />
            <Section.Item
              label={t('settings.about.contact.title')}
              leading={<MailIcon className="size-5 text-foreground" strokeWidth={2} />}
              onPress={() => openLink(ABOUT_LINKS.contact)}
              trailing={
                <SquareArrowOutUpRightIcon
                  className="size-5 text-default-foreground"
                  strokeWidth={2}
                />
              }
            />
          </Section>
        </View>
      </ScrollView>
    </>
  );
}
