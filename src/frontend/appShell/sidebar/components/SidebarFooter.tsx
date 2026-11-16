import TrashIcon from '@cherrystudio/app-icons/icons/trash-2';
import { Spinner, Surface } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useResolveClassNames, useUniwind } from 'uniwind';

import { ProfileAvatarImage } from '@/frontend/components/Avatar';
import { usePreference } from '@/frontend/data/hooks';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { appSidebar } from '@/frontend/utils/constants';

import { useSidebarActions } from '../context';
import { useDockMetrics } from '../hooks/useDockMetrics';
import { useSidebarDestination } from '../hooks/useSidebarDestination';
import { useSidebarSelection, useSidebarSelectionSnapshot } from '../SidebarSelectionProvider';
import { SidebarFade } from './SidebarFade/SidebarFade';

// Floats over the session list while the body owns enough bottom padding to
// keep its final row reachable.
export function SidebarFooter() {
  const { t } = useTranslation();
  const [userName] = usePreference('app.user.name');
  const { bottomPadding, insetEnd, insetStart } = useDockMetrics();
  const { theme } = useUniwind();
  const surfaceColor = useThemeColor(theme === 'dark' ? 'sidebar' : 'background');
  const { backgroundColor: transparentSurfaceColor } = useResolveClassNames(
    theme === 'dark' ? 'bg-sidebar/0' : 'bg-background/0',
  );
  // iOS needs the surface RGB at zero alpha to avoid interpolating through black.
  const fadeStartColor =
    Platform.OS === 'ios' ? (transparentSurfaceColor ?? 'transparent') : 'transparent';
  const fadeHeight = appSidebar.headerGapY * 2;
  const backgroundHeight = bottomPadding + appSidebar.dockHeight + fadeHeight;
  const { openSettings } = useSidebarActions('SidebarFooter');
  const displayName = userName.trim();
  const isSettingsOpen = useSidebarDestination() === 'settings';
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
      style={{
        paddingBottom: bottomPadding,
        paddingEnd: insetEnd,
        paddingStart: insetStart,
        zIndex: 2,
      }}
    >
      {/* Tint the profile row through the bottom safe area, with a soft leading edge above it. */}
      <View
        className="absolute right-0 bottom-0 left-0"
        pointerEvents="none"
        style={{ height: backgroundHeight }}
      >
        <SidebarFade edge="bottom" size={backgroundHeight} />
        <LinearGradient
          colors={[fadeStartColor, surfaceColor, surfaceColor]}
          locations={[0, fadeHeight / backgroundHeight, 1]}
          style={[StyleSheet.absoluteFill, { opacity: 0.9 }]}
        />
      </View>
      <View style={{ height: appSidebar.dockHeight }}>
        <Animated.View
          accessibilityElementsHidden={isSelecting}
          className="absolute inset-0 flex-row items-center justify-between"
          importantForAccessibility={isSelecting ? 'no-hide-descendants' : 'auto'}
          pointerEvents={isSelecting ? 'none' : 'auto'}
          style={normalStyle}
        >
          <Pressable
            accessibilityLabel={t('navigation.settings')}
            accessibilityRole="button"
            accessibilityState={{ disabled: isSelecting || isDeleting, selected: isSettingsOpen }}
            disabled={isSelecting || isDeleting}
            onPress={openSettings}
            style={{ flex: 1 }}
            testID="sidebar-settings"
          >
            {({ pressed }) => (
              <View
                className={cn(
                  'min-h-11 flex-row items-center gap-3 rounded-xl px-1',
                  isSettingsOpen && 'bg-secondary',
                  pressed && 'opacity-60',
                )}
              >
                <ProfileAvatarImage
                  accessibilityLabel={displayName || t('settings.profile.avatar')}
                  size={36}
                />
                <Text
                  className="min-w-0 flex-1 font-medium text-base text-sidebar-foreground"
                  numberOfLines={1}
                >
                  {displayName || t('settings.profile.title')}
                </Text>
              </View>
            )}
          </Pressable>
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
