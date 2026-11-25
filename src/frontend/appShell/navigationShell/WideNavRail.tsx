import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProfileAvatarImage } from '@/frontend/components/Avatar';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { getNavTitleKey, WIDE_RAIL_DESTINATIONS } from './dockTabs';
import { NavIcon } from './NavIcon';
import { WIDE_RAIL_WIDTH } from './shellMode';
import { useNavigationShell } from './state';

/** Permanent 60pt left icon rail on wide desktop/tablet windows. */
export function WideNavRail() {
  const { t } = useTranslation();
  const outerInsets = useSafeAreaInsets();
  const { activeDestination, isOnboardingBlocking, navigateToDestination, shellMode } =
    useNavigationShell();
  const [foregroundColor, mutedForegroundColor] = useThemeColor(['foreground', 'muted-foreground']);

  if (isOnboardingBlocking || shellMode !== 'wide-rail') {
    return null;
  }

  return (
    <View
      accessibilityRole="tablist"
      className="bg-background border-sidebar-border h-full shrink-0 items-center justify-between border-r"
      style={{
        paddingBottom: Math.max(outerInsets.bottom, 14),
        paddingLeft: outerInsets.left,
        paddingTop: outerInsets.top + 10,
        width: outerInsets.left + WIDE_RAIL_WIDTH,
      }}
      testID="wide-nav-rail"
    >
      <View className="items-center gap-1.5">
        {WIDE_RAIL_DESTINATIONS.map((dest) => {
          const isActive = activeDestination === dest;
          return (
            <Pressable
              key={dest}
              accessibilityLabel={t(getNavTitleKey(dest))}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              className={`h-10 w-10 items-center justify-center rounded-xl ${
                isActive ? 'bg-secondary-active' : ''
              }`}
              onPress={() => navigateToDestination(dest)}
              testID={`wide-rail-tab-${dest}`}
            >
              <NavIcon
                color={isActive ? foregroundColor : mutedForegroundColor}
                filled={isActive}
                id={dest}
                size={22}
              />
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityLabel={t('navigation.settings')}
        accessibilityRole="button"
        accessibilityState={{ selected: activeDestination === 'settings' }}
        className={`h-10 w-10 items-center justify-center rounded-full ${
          activeDestination === 'settings'
            ? 'bg-secondary-active border-border-selected border'
            : ''
        }`}
        onPress={() => navigateToDestination('settings')}
        testID="wide-rail-settings"
      >
        <ProfileAvatarImage accessibilityLabel={t('navigation.settings')} size={30} />
      </Pressable>
    </View>
  );
}
