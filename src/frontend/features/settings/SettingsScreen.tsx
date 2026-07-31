import { resolveProviderIcon } from '@cherrystudio/ui/icons';
import { useRouter } from 'expo-router';
import {
  CircleUserRoundIcon,
  CloudIcon,
  DatabaseIcon,
  EarthIcon,
  GlobeIcon,
  InfoIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SunIcon,
} from 'lucide-uniwind/png';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import { usePreference } from '@/frontend/data/hooks';

import { SettingSelect } from './components/SettingSelect';
import { SettingsSection } from './components/SettingsSection';
import { usePrefetchProviders } from './hooks/usePrefetchProviders';
import { useSettingPreferences } from './hooks/useSettingPreferences';
import { ProfileHero, ProfileStickyBar, useProfileHeaderAnimation } from './profileHero';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUniwind();
  const tabBarHeight = useBottomTabBarHeight();
  const [userName] = usePreference('app.user.name');
  const settingPreferences = useSettingPreferences();
  const prefetchProviders = usePrefetchProviders();
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
    <View className="flex-1 bg-background">
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
          <SettingsSection
            items={[
              {
                icon: CircleUserRoundIcon,
                title: t('settings.items.profile'),
                onPress: openProfileSettings,
              },
            ]}
          />
          <SettingsSection
            items={[
              {
                icon: CloudIcon,
                title: t('settings.items.modelService'),
                onPress: () => router.push('/settings/provider'),
                onPressIn: prefetchProviders,
              },
              {
                icon: SparklesIcon,
                title: t('settings.items.defaultModel'),
                onPress: () => router.push('/settings/model'),
              },
            ]}
          />
          <SettingsSection
            items={[
              {
                icon: EarthIcon,
                title: t('settings.items.webSearch'),
                onPress: () => router.push('/settings/websearch'),
              },
              {
                imageSource: mcpIcon,
                title: t('settings.items.mcp'),
                onPress: () => router.push('/settings/mcp'),
              },
            ]}
          />
          <SettingsSection
            items={[
              {
                icon: DatabaseIcon,
                title: t('settings.items.dataBackup'),
                onPress: () => router.push('/settings/data'),
              },
              {
                icon: ShieldCheckIcon,
                title: t('settings.items.permissions'),
                onPress: () => router.push('/settings/permissions'),
              },
            ]}
          />
          <SettingsSection
            items={[
              {
                accessory: (
                  <SettingSelect
                    label={t('settings.items.appLanguage')}
                    options={settingPreferences.language.options}
                    value={settingPreferences.language.value}
                    onValueChange={settingPreferences.language.onValueChange}
                  />
                ),
                icon: GlobeIcon,
                title: t('settings.items.appLanguage'),
              },
              {
                accessory: (
                  <SettingSelect
                    label={t('settings.items.appearance')}
                    options={settingPreferences.theme.options}
                    value={settingPreferences.theme.value}
                    onValueChange={settingPreferences.theme.onValueChange}
                  />
                ),
                icon: SunIcon,
                title: t('settings.items.appearance'),
              },
            ]}
          />
          <SettingsSection
            items={[
              {
                icon: InfoIcon,
                title: t('settings.items.aboutUs'),
                onPress: () => router.push('/settings/about'),
              },
            ]}
          />
        </View>
      </Animated.ScrollView>
      <ProfileStickyBar scrollY={scrollY} topInset={insets.top} userName={userName} />
    </View>
  );
}
