import {
  CircleUserRoundIcon,
  CloudIcon,
  DatabaseIcon,
  EarthIcon,
  InfoIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SunIcon,
  WrenchIcon,
} from '@cherrystudio/app-icons';
import { Section } from '@cherrystudio/ui/components';
import { resolveProviderIcon } from '@cherrystudio/ui/icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import { Image } from '@/frontend/components/nativePrimitives';
import { usePreference } from '@/frontend/data/hooks';

import { ProfileHero, ProfileStickyBar, useProfileHeaderAnimation } from './profileHero';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUniwind();
  const tabBarHeight = useBottomTabBarHeight();
  const [userName] = usePreference('app.user.name');
  const { lockProgress, onScroll, scrollY, toggleHeroLock } = useProfileHeaderAnimation();
  const mcpIcon = resolveProviderIcon('mcp')?.[theme === 'dark' ? 'dark' : 'light'];

  const openProfileSettings = useCallback(() => {
    router.push('/settings/profile');
  }, [router]);

  // With no name set yet, the hero is a call to action: tapping it (avatar or the
  // prompt) opens profile settings instead of toggling the expand/collapse lock.
  const hasUserName = userName.trim().length > 0;
  const onHeroPress = hasUserName ? toggleHeroLock : openProfileSettings;

  // Own the insets explicitly: `never` keeps the scroll-offset zero point stable
  // (so scrollY reads 0 at rest and negative on iOS overscroll), which the hero
  // animation depends on. No top padding: the hero box is pinned to content y=0
  // and draws under the status bar, exactly like the reference header.
  const contentContainerStyle = useMemo(() => ({ paddingBottom: tabBarHeight }), [tabBarHeight]);

  return (
    <View className="flex-1 bg-grouped-background">
      <Animated.ScrollView
        alwaysBounceVertical
        contentContainerStyle={contentContainerStyle}
        contentInsetAdjustmentBehavior="never"
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <ProfileHero
          lockProgress={lockProgress}
          onPress={onHeroPress}
          scrollY={scrollY}
          userName={userName}
        />
        <View className="gap-6 px-2 pt-6">
          <Section>
            <Section.Item
              label={t('settings.items.profile')}
              leading={<CircleUserRoundIcon className="size-5 text-foreground" />}
              onPress={openProfileSettings}
            />
          </Section>
          <Section>
            <Section.Item
              label={t('settings.items.modelService')}
              leading={<CloudIcon className="size-5 text-foreground" />}
              onPress={() => router.push('/settings/provider')}
            />
            <Section.Item
              label={t('settings.items.defaultModel')}
              leading={<SparklesIcon className="size-5 text-foreground" />}
              onPress={() => router.push('/settings/model')}
            />
          </Section>
          <Section>
            <Section.Item
              label={t('settings.items.webSearch')}
              leading={<EarthIcon className="size-5 text-foreground" />}
              onPress={() => router.push('/settings/websearch')}
            />
            <Section.Item
              label={t('settings.items.mcp')}
              leading={
                mcpIcon ? (
                  <Image
                    cachePolicy="memory-disk"
                    className="size-5"
                    contentFit="contain"
                    source={mcpIcon}
                  />
                ) : null
              }
              onPress={() => router.push('/settings/mcp')}
            />
            <Section.Item
              label={t('settings.items.builtInTools')}
              leading={<WrenchIcon className="size-5 text-foreground" />}
              onPress={() => router.push('/settings/built-in-tools')}
            />
          </Section>
          <Section>
            <Section.Item
              label={t('settings.items.dataBackup')}
              leading={<DatabaseIcon className="size-5 text-foreground" />}
              onPress={() => router.push('/settings/data')}
            />
            <Section.Item
              label={t('settings.items.permissions')}
              leading={<ShieldCheckIcon className="size-5 text-foreground" />}
              onPress={() => router.push('/settings/permissions')}
            />
          </Section>
          <Section>
            <Section.Item
              label={t('settings.appearance.title')}
              leading={<SunIcon className="size-5 text-foreground" />}
              onPress={() => router.push('/settings/appearance')}
            />
          </Section>
          <Section>
            <Section.Item
              label={t('settings.items.aboutUs')}
              leading={<InfoIcon className="size-5 text-foreground" />}
              onPress={() => router.push('/settings/about')}
            />
          </Section>
        </View>
      </Animated.ScrollView>
      <ProfileStickyBar scrollY={scrollY} topInset={insets.top} userName={userName} />
    </View>
  );
}
