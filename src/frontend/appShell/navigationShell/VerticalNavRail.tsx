import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { getNavTitleKey, resolveDockTabs } from './dockTabs';
import { NavIcon } from './NavIcon';
import { VERTICAL_RAIL_WIDTH } from './shellMode';
import { useNavigationShell } from './state';

/** Trailing vertical rail for foldable screens whose OS system bar runs down the trailing edge. */
export function VerticalNavRail() {
  const { t } = useTranslation();
  const outerInsets = useSafeAreaInsets();
  const { activeDockTab, navigateToDestination, pinnedTabs, shellMode } = useNavigationShell();
  const [foregroundColor, mutedForegroundColor] = useThemeColor(['foreground', 'muted-foreground']);
  const tabs = useMemo(() => resolveDockTabs(pinnedTabs), [pinnedTabs]);

  if (shellMode !== 'vertical-rail') {
    return null;
  }

  return (
    <View
      accessibilityRole="tablist"
      className="bg-background border-sidebar-border h-full shrink-0 items-center justify-center border-l"
      style={{
        paddingBottom: Math.max(outerInsets.bottom, 12),
        paddingRight: outerInsets.right,
        paddingTop: Math.max(outerInsets.top, 12),
        width: outerInsets.right + VERTICAL_RAIL_WIDTH,
      }}
      testID="vertical-nav-rail"
    >
      <View className="items-center gap-2.5">
        {tabs.map((tabId) => {
          const isActive = activeDockTab === tabId;
          return (
            <Pressable
              key={tabId}
              accessibilityLabel={t(getNavTitleKey(tabId))}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              className={`h-12 w-12 items-center justify-center rounded-full ${
                isActive ? 'bg-secondary-active' : ''
              }`}
              onPress={() => navigateToDestination(tabId)}
              testID={`vertical-rail-tab-${tabId}`}
            >
              <NavIcon
                color={isActive ? foregroundColor : mutedForegroundColor}
                filled={isActive}
                id={tabId}
                size={22}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
