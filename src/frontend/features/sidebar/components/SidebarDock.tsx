import SettingsIcon from '@cherrystudio/app-icons/icons/settings';
import SquarePenIcon from '@cherrystudio/app-icons/icons/square-pen';
import { Surface } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { appSidebar } from '@/frontend/utils/constants';

import { useDockMetrics } from '../useDockMetrics';

type SidebarDockProps = {
  onNewChatPress: () => void;
  onSettingsPress: () => void;
};

// Both buttons float over the session list rather than sitting below it, so the
// list scrolls behind them the way it does in ChatGPT. The list owns the bottom
// padding that keeps its last row reachable.
//
// `Surface` ignores className on its Liquid Glass branch, so every dimension
// lives in `style` and className only carries the non-glass fallback's color.
export function SidebarDock({ onNewChatPress, onSettingsPress }: SidebarDockProps) {
  const { t } = useTranslation();
  const [primaryColor, primaryForegroundColor, accentColor, foregroundColor] = useThemeColor([
    'sidebar-primary',
    'sidebar-primary-foreground',
    'sidebar-accent',
    'sidebar-foreground',
  ]);
  const radius = appSidebar.dockHeight / 2;
  const { bottomPadding, inset } = useDockMetrics();

  return (
    // Ends of the sidebar, not a huddle in the corner: the chat pill anchors the
    // left edge and settings the right, both on the same `dockHeight` baseline.
    <View
      className="flex-row items-center justify-between"
      style={{ paddingBottom: bottomPadding, paddingHorizontal: inset }}
    >
      <Surface
        className="bg-sidebar-primary"
        cornerRadius={radius}
        interactive
        style={{ height: appSidebar.dockHeight }}
        tintColor={primaryColor}
      >
        <Pressable
          accessibilityLabel={t('navigation.newChat')}
          accessibilityRole="button"
          onPress={onNewChatPress}
          style={({ pressed }) => ({
            alignItems: 'center',
            flexDirection: 'row',
            gap: 8,
            height: '100%',
            opacity: pressed ? 0.6 : 1,
            paddingHorizontal: 16,
          })}
        >
          <SquarePenIcon color={primaryForegroundColor} size={18} />
          <Text className="font-medium text-[15px] text-sidebar-primary-foreground">
            {t('navigation.newChat')}
          </Text>
        </Pressable>
      </Surface>

      {/* Glass draws nothing without a tint to refract, and the sidebar surface
          is too flat to give it anything on its own. */}
      <Surface
        className="bg-sidebar-accent"
        cornerRadius={radius}
        interactive
        style={{ height: appSidebar.dockHeight, width: appSidebar.dockHeight }}
        tintColor={accentColor}
      >
        <Pressable
          accessibilityLabel={t('navigation.settings')}
          accessibilityRole="button"
          onPress={onSettingsPress}
          style={({ pressed }) => ({
            alignItems: 'center',
            height: '100%',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
            width: '100%',
          })}
        >
          <SettingsIcon color={foregroundColor} size={24} />
        </Pressable>
      </Surface>
    </View>
  );
}
