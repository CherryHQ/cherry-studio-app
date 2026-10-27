import TrashIcon from '@cherrystudio/app-icons/icons/trash-2';
import { Spinner, Surface } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { ProfileAvatarImage } from '@/frontend/components/Avatar';
import { usePreference } from '@/frontend/data/hooks';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { appSidebar } from '@/frontend/utils/constants';

import NewConversationIcon from '../../icons/NewConversationIcon';
import { useSidebarActions } from '../context';
import { useDockMetrics } from '../hooks/useDockMetrics';
import { useSidebarDestination } from '../hooks/useSidebarDestination';
import { useSidebarSelection, useSidebarSelectionSnapshot } from '../SidebarSelectionProvider';

// Floats over the session list while the body owns enough bottom padding to
// keep its final row reachable.
export function SidebarFooter() {
  const { t } = useTranslation();
  const [userName] = usePreference('app.user.name');
  const primaryForegroundColor = useThemeColor('sidebar-primary-foreground');
  const { bottomPadding, insetEnd, insetStart } = useDockMetrics();
  const { openSettings, startNewChat } = useSidebarActions('SidebarFooter');
  const displayName = userName.trim();
  const isSettingsOpen = useSidebarDestination() === 'settings';
  const selectedColor = useThemeColor('secondary');
  const selection = useSidebarSelection();
  const { progress } = selection;
  const isSelecting = useSidebarSelectionSnapshot((state) => state.isSelecting);
  const isDeleting = useSidebarSelectionSnapshot((state) => state.isDeleting);
  const selectedCount = useSidebarSelectionSnapshot((state) => state.selectedIds.size);
  const normalStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.get(),
    transform: [{ translateY: -8 * progress.get() }],
  }));
  const selectionStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: 8 * (1 - progress.get()) }],
  }));

  return (
    <View
      className="absolute right-0 bottom-0 left-0"
      pointerEvents="box-none"
      style={{ paddingBottom: bottomPadding, paddingEnd: insetEnd, paddingStart: insetStart }}
    >
      <View style={{ height: appSidebar.dockHeight }}>
        <Animated.View
          accessibilityElementsHidden={isSelecting}
          className="absolute inset-0 flex-row items-center justify-between"
          importantForAccessibility={isSelecting ? 'no-hide-descendants' : 'auto'}
          pointerEvents={isSelecting ? 'none' : 'auto'}
          style={normalStyle}
        >
          <Surface interactive shape="pill" tone="sidebar-primary">
            <Pressable
              accessibilityLabel={t('navigation.newChat')}
              accessibilityRole="button"
              accessibilityState={{ disabled: isSelecting || isDeleting }}
              disabled={isSelecting || isDeleting}
              onPress={startNewChat}
              style={({ pressed }) => ({
                alignItems: 'center',
                flexDirection: 'row',
                gap: 8,
                height: appSidebar.dockHeight,
                opacity: isDeleting ? 0.4 : pressed ? 0.6 : 1,
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
              accessibilityState={{ disabled: isSelecting || isDeleting, selected: isSettingsOpen }}
              disabled={isSelecting || isDeleting}
              onPress={openSettings}
              style={({ pressed }) => ({
                alignItems: 'center',
                // Settings filling the content region marks the avatar like a selected row.
                backgroundColor: isSettingsOpen ? selectedColor : undefined,
                borderRadius: appSidebar.dockHeight / 2,
                flexDirection: 'row',
                gap: 8,
                height: appSidebar.dockHeight,
                opacity: isDeleting ? 0.4 : pressed ? 0.6 : 1,
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
        </Animated.View>
        <Animated.View
          accessibilityElementsHidden={!isSelecting}
          className="absolute inset-0 flex-row items-center justify-between gap-2"
          importantForAccessibility={isSelecting ? 'auto' : 'no-hide-descendants'}
          pointerEvents={isSelecting ? 'auto' : 'none'}
          style={selectionStyle}
        >
          <Surface interactive shape="pill">
            <Pressable
              accessibilityLabel={t('common.cancel')}
              accessibilityRole="button"
              accessibilityState={{ disabled: isDeleting }}
              disabled={isDeleting}
              onPress={selection.exit}
              style={({ pressed }) => ({
                alignItems: 'center',
                height: appSidebar.dockHeight,
                justifyContent: 'center',
                opacity: isDeleting ? 0.4 : pressed ? 0.6 : 1,
                paddingHorizontal: 20,
              })}
              testID="sidebar-cancel-selection"
            >
              <Text className="font-medium text-[15px] text-sidebar-foreground">
                {t('common.cancel')}
              </Text>
            </Pressable>
          </Surface>
          <Surface interactive shape="circle">
            <Pressable
              accessibilityLabel={
                isDeleting
                  ? t('session.selection.deleting')
                  : t('session.selection.deleteAction', { count: selectedCount })
              }
              accessibilityRole="button"
              accessibilityState={{ busy: isDeleting, disabled: isDeleting || !selectedCount }}
              disabled={isDeleting || !selectedCount}
              onPress={selection.requestDelete}
              style={({ pressed }) => ({
                alignItems: 'center',
                height: appSidebar.dockHeight,
                justifyContent: 'center',
                opacity: pressed ? 0.6 : 1,
                width: appSidebar.dockHeight,
              })}
              testID="sidebar-delete-selected"
            >
              {isDeleting ? (
                <Spinner size="sm" />
              ) : (
                <TrashIcon
                  className={selectedCount ? 'size-5 text-error' : 'size-5 text-muted-foreground'}
                />
              )}
            </Pressable>
          </Surface>
        </Animated.View>
      </View>
    </View>
  );
}
