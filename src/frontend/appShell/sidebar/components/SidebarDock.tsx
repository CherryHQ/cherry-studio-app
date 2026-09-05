import { Surface } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { ProfileAvatarImage } from '@/frontend/components/Avatar';
import { usePreference } from '@/frontend/data/hooks';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { appSidebar } from '@/frontend/utils/constants';

import NewConversationIcon from '../../icons/NewConversationIcon';
import { useDockMetrics } from '../hooks/useDockMetrics';

type SidebarDockProps = {
  onNewChatPress: () => void;
  onSettingsPress: () => void;
};

// Both buttons float over the session list rather than sitting below it, so the
// list scrolls behind them the way it does in ChatGPT. The list owns the bottom
// padding that keeps its last row reachable.
export function SidebarDock({ onNewChatPress, onSettingsPress }: SidebarDockProps) {
  const { t } = useTranslation();
  const [userName] = usePreference('app.user.name');
  const primaryForegroundColor = useThemeColor('sidebar-primary-foreground');
  const { bottomPadding, inset } = useDockMetrics();
  const displayName = userName.trim();

  return (
    // Ends of the sidebar, not a huddle in the corner: the chat pill anchors the
    // left edge and settings the right, both on the same `dockHeight` baseline.
    <View
      className="flex-row items-center justify-between"
      style={{ paddingBottom: bottomPadding, paddingHorizontal: inset }}
    >
      <Surface interactive shape="pill" tone="sidebar-primary">
        <Pressable
          accessibilityLabel={t('navigation.newChat')}
          accessibilityRole="button"
          onPress={onNewChatPress}
          style={({ pressed }) => ({
            alignItems: 'center',
            flexDirection: 'row',
            gap: 8,
            height: appSidebar.dockHeight,
            opacity: pressed ? 0.6 : 1,
            paddingHorizontal: 16,
          })}
        >
          <NewConversationIcon color={primaryForegroundColor} size={18} />
          <Text className="font-medium text-[15px] text-sidebar-primary-foreground">
            {t('navigation.newChat')}
          </Text>
        </Pressable>
      </Surface>

      <View className="overflow-hidden rounded-full bg-card">
        <Pressable
          accessibilityLabel={t('navigation.settings')}
          accessibilityRole="button"
          onPress={onSettingsPress}
          style={({ pressed }) => ({
            alignItems: 'center',
            flexDirection: 'row',
            gap: 8,
            height: appSidebar.dockHeight,
            opacity: pressed ? 0.6 : 1,
            paddingHorizontal: 10,
          })}
        >
          <ProfileAvatarImage
            accessibilityLabel={displayName || t('settings.profile.avatar')}
            size={32}
          />
          {displayName ? (
            <Text
              className="min-w-0 max-w-20 shrink font-medium text-[15px] text-sidebar-foreground"
              numberOfLines={1}
            >
              {displayName}
            </Text>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}
