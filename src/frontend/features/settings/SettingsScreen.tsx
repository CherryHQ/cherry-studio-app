import {
  BellIcon,
  CircleHalfIcon,
  CloudIcon,
  DatabaseIcon,
  InfoIcon,
  LockIcon,
  NetworkIcon,
  PersonCropSquareOnSquareAngledIcon,
  SparklesIcon,
  XIcon,
} from '@cherrystudio/app-icons';
import { Section, Surface } from '@cherrystudio/ui/components';
import { resolveProviderIcon } from '@cherrystudio/ui/icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import { Image } from '@/frontend/components/nativePrimitives';
import { usePreference } from '@/frontend/data/hooks';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { settingsSheet } from '@/frontend/utils/constants';

import { ProfileHero, ProfileStickyBar, useProfileHeaderAnimation } from './profileHero';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUniwind();
  const [userName] = usePreference('app.user.name');
  const [groupedBackgroundColor, foregroundColor] = useThemeColor([
    'grouped-background',
    'foreground',
  ]);
  const { lockProgress, onScroll, scrollY, toggleHeroLock } = useProfileHeaderAnimation();
  const mcpIcon = resolveProviderIcon('mcp')?.[theme === 'dark' ? 'dark' : 'light'];
  const closeRadius = settingsSheet.closeSize / 2;
  const closeInset = settingsSheet.cornerRadius - closeRadius;

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
  // and runs to the sheet's own top edge.
  const contentContainerStyle = useMemo(() => ({ paddingBottom: insets.bottom }), [insets.bottom]);

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
              leading={<PersonCropSquareOnSquareAngledIcon className="size-5 text-foreground" />}
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
              leading={<NetworkIcon className="size-5 text-foreground" />}
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
          </Section>
          <Section>
            {Platform.OS === 'ios' ? (
              <Section.Item
                label={t('settings.items.notifications')}
                leading={<BellIcon className="size-5 text-foreground" />}
                onPress={() => router.push('/settings/notifications')}
              />
            ) : null}
            <Section.Item
              label={t('settings.items.dataBackup')}
              leading={<DatabaseIcon className="size-5 text-foreground" />}
              onPress={() => router.push('/settings/data')}
            />
            <Section.Item
              label={t('settings.items.permissions')}
              leading={<LockIcon className="size-5 text-foreground" />}
              onPress={() => router.push('/settings/permissions')}
            />
          </Section>
          <Section>
            <Section.Item
              label={t('settings.appearance.title')}
              leading={<CircleHalfIcon className="size-5 text-foreground" />}
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
      {/* No top inset above: the sheet starts below the status bar, but
          `useSafeAreaInsets` still reports the window's, so honoring it here
          would push everything down by a status bar that isn't there. */}
      <ProfileStickyBar scrollY={scrollY} topInset={0} userName={userName} />
      {/* The sticky bar is pointerEvents:none, so the close control lives in its
          own tappable overlay on top. Its inset makes it concentric with the
          sheet's corner: nested rounded rects only read as nested when they
          share a center. Dragging the sheet down is not enough on its own here —
          the hero owns the top of the screen and swallows that gesture. */}
      <View className="absolute" style={{ right: closeInset, top: closeInset }}>
        <Surface
          className="bg-grouped-background"
          cornerRadius={closeRadius}
          interactive
          style={{ height: settingsSheet.closeSize, width: settingsSheet.closeSize }}
          // Glass refracts what is behind it, and the hero photo it sits on is
          // arbitrary; the tint is what keeps the glyph legible over any of them.
          tintColor={groupedBackgroundColor}
        >
          <Pressable
            accessibilityLabel={t('common.close')}
            accessibilityRole="button"
            onPress={router.back}
            style={({ pressed }) => ({
              alignItems: 'center',
              height: '100%',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
              width: '100%',
            })}
          >
            <XIcon color={foregroundColor} size={18} />
          </Pressable>
        </Surface>
      </View>
    </View>
  );
}
