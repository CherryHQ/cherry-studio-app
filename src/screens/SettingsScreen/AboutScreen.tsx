import { PROVIDER_ICONS } from '@cherrystudio/ui/icons-png/providers';
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
import { Image, Linking, ScrollView, Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { BackHeader } from '@/components/headers';
import { SettingsSection } from './components/SettingsSection';

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
    Linking.openURL(url).catch(() => undefined);
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
          <View className="flex-row gap-4 rounded-2xl bg-settings-grouped-surface px-4 py-5">
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
              <View className="self-start rounded-full bg-accent/10 px-2 py-0.5">
                <Text className="font-medium text-accent text-sm">v{APP_VERSION}</Text>
              </View>
            </View>
          </View>

          <SettingsSection
            items={[
              {
                accessory: (
                  <SquareArrowOutUpRightIcon
                    className="size-5 text-default-foreground"
                    strokeWidth={2}
                  />
                ),
                icon: GitHubIcon,
                title: t('settings.about.repository.title'),
                onPress: () => openLink(ABOUT_LINKS.repository),
              },
              {
                accessory: (
                  <SquareArrowOutUpRightIcon
                    className="size-5 text-default-foreground"
                    strokeWidth={2}
                  />
                ),
                icon: RssIcon,
                title: t('settings.about.releases.title'),
                onPress: () => openLink(ABOUT_LINKS.releases),
              },
              {
                accessory: (
                  <SquareArrowOutUpRightIcon
                    className="size-5 text-default-foreground"
                    strokeWidth={2}
                  />
                ),
                icon: GlobeIcon,
                title: t('settings.about.website.title'),
                onPress: () => openLink(ABOUT_LINKS.website),
              },
              {
                accessory: (
                  <SquareArrowOutUpRightIcon
                    className="size-5 text-default-foreground"
                    strokeWidth={2}
                  />
                ),
                icon: CodeIcon,
                title: t('settings.about.feedback.title'),
                onPress: () => openLink(ABOUT_LINKS.feedback),
              },
              {
                accessory: (
                  <SquareArrowOutUpRightIcon
                    className="size-5 text-default-foreground"
                    strokeWidth={2}
                  />
                ),
                icon: CopyrightIcon,
                title: t('settings.about.license.title'),
                onPress: () => openLink(ABOUT_LINKS.license),
              },
              {
                accessory: (
                  <SquareArrowOutUpRightIcon
                    className="size-5 text-default-foreground"
                    strokeWidth={2}
                  />
                ),
                icon: MailIcon,
                title: t('settings.about.contact.title'),
                onPress: () => openLink(ABOUT_LINKS.contact),
              },
            ]}
            title={t('settings.about.title')}
          />
        </View>
      </ScrollView>
    </>
  );
}
