import { Surface } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { ProfileAvatarImage } from '@/frontend/components/Avatar';
import { usePreference } from '@/frontend/data/hooks';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { appSidebar } from '@/frontend/utils/constants';

import NewConversationIcon from '../../icons/NewConversationIcon';
import { useSidebarActions } from '../context';
import { useDockMetrics } from '../hooks/useDockMetrics';

// Floats over the session list while the body owns enough bottom padding to
// keep its final row reachable.
export function SidebarFooter() {
  const { t } = useTranslation();
  const [userName] = usePreference('app.user.name');
  const primaryForegroundColor = useThemeColor('sidebar-primary-foreground');
  const { bottomPadding, inset } = useDockMetrics();
  const { openSettings, startNewChat } = useSidebarActions('SidebarFooter');
  const displayName = userName.trim();

  return (
    <View
      className="absolute right-0 bottom-0 left-0 flex-row items-center justify-between"
      pointerEvents="box-none"
      style={{ paddingBottom: bottomPadding, paddingHorizontal: inset }}
    >
      <Surface interactive shape="pill" tone="sidebar-primary">
        <Pressable
          accessibilityLabel={t('navigation.newChat')}
          accessibilityRole="button"
          onPress={startNewChat}
          style={({ pressed }) => ({
            alignItems: 'center',
            flexDirection: 'row',
            gap: 8,
            height: appSidebar.dockHeight,
            opacity: pressed ? 0.6 : 1,
            paddingHorizontal: 16,
          })}
          testID="sidebar-new-chat"
        >
          <NewConversationIcon color={primaryForegroundColor} size={18} />
          <Text className="font-medium text-[15px] text-sidebar-primary-foreground">
            {t('navigation.newChat')}
          </Text>
        </Pressable>
      </Surface>

      <Surface interactive shape="pill">
        <Pressable
          accessibilityLabel={t('navigation.settings')}
          accessibilityRole="button"
          onPress={openSettings}
          style={({ pressed }) => ({
            alignItems: 'center',
            flexDirection: 'row',
            gap: 8,
            height: appSidebar.dockHeight,
            opacity: pressed ? 0.6 : 1,
            paddingHorizontal: 10,
          })}
          testID="sidebar-settings"
        >
          <ProfileAvatarImage
            accessibilityLabel={displayName || t('settings.profile.avatar')}
            size={28}
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
      </Surface>
    </View>
  );
}
