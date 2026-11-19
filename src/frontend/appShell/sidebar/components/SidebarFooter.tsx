import TrashIcon from '@cherrystudio/app-icons/icons/trash-2';
import { Spinner, Surface } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useDerivedValue } from 'react-native-reanimated';
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
import { SidebarPlanBadge } from './SidebarPlanBadge';

// Floats over the session list while the body owns enough bottom padding to
// keep its final row reachable.
export function SidebarFooter() {
  const { t } = useTranslation();
  const [userName] = usePreference('app.user.name');
  const {
    bottomPadding,
    insetEnd,
    insetStart,
    contentHeight,
    normalContentHeight,
    fadeHeight,
    normalBackgroundHeight,
    selectionBackgroundHeight,
  } = useDockMetrics();
  const { theme } = useUniwind();
  const surfaceColor = useThemeColor(theme === 'dark' ? 'sidebar' : 'background');
  const { backgroundColor: transparentSurfaceColor } = useResolveClassNames(
    theme === 'dark' ? 'bg-sidebar/0' : 'bg-background/0',
  );
  // iOS needs the surface RGB at zero alpha to avoid interpolating through black.
  const fadeStartColor =
    Platform.OS === 'ios' ? (transparentSurfaceColor ?? 'transparent') : 'transparent';
  const { openSettings, startNewChat } = useSidebarActions('SidebarFooter');
  const displayName = userName.trim();
  const isSettingsOpen = useSidebarDestination() === 'settings';
  const selection = useSidebarSelection();
  const { progress } = selection;
  const isSelecting = useSidebarSelectionSnapshot((state) => state.isSelecting);
  const isDeleting = useSidebarSelectionSnapshot((state) => state.isDeleting);
  const selectedCount = useSidebarSelectionSnapshot((state) => state.selectedIds.size);
  // Fade the rows before shrinking most of their backdrop; retain coverage during overlap.
  const backgroundHeight = useDerivedValue(
    () =>
      normalBackgroundHeight +
      (selectionBackgroundHeight - normalBackgroundHeight) *
        Math.max(0, (progress.get() - 0.4) / 0.6),
  );
  const backgroundStyle = useAnimatedStyle(() => ({ height: backgroundHeight.get() }));
  // Keep the blur bands' proportions, compensating RN's centre-anchored scale at the bottom.
  const blurStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: (normalBackgroundHeight - backgroundHeight.get()) / 2 },
      { scaleY: backgroundHeight.get() / normalBackgroundHeight },
    ],
  }));
  const normalStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - 2 * progress.get()),
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
      {/* Tint the dock through the bottom safe area, with a soft leading edge above it. */}
      <Animated.View
        className="absolute right-0 bottom-0 left-0 overflow-hidden"
        pointerEvents="none"
        style={backgroundStyle}
      >
        <Animated.View
          className="absolute right-0 bottom-0 left-0"
          style={[{ height: normalBackgroundHeight }, blurStyle]}
        >
          <SidebarFade edge="bottom" size={normalBackgroundHeight} />
        </Animated.View>
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: surfaceColor, opacity: 0.9, top: fadeHeight },
          ]}
        />
        <LinearGradient
          colors={[fadeStartColor, surfaceColor]}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            left: 0,
            height: fadeHeight,
            opacity: 0.9,
          }}
        />
      </Animated.View>
      <View pointerEvents="box-none" style={{ height: contentHeight }}>
        <Animated.View
          accessibilityElementsHidden={isSelecting}
          className="absolute right-0 bottom-0 left-0"
          importantForAccessibility={isSelecting ? 'no-hide-descendants' : 'auto'}
          pointerEvents={isSelecting ? 'none' : 'box-none'}
          style={[normalStyle, { height: normalContentHeight, gap: appSidebar.dockRowGap }]}
        >
          <Pressable
            accessibilityLabel={t('navigation.newChat')}
            accessibilityRole="button"
            accessibilityState={{ disabled: isSelecting || isDeleting }}
            disabled={isSelecting || isDeleting}
            onPress={startNewChat}
            style={{ height: appSidebar.dockHeight }}
            testID="sidebar-new-chat"
          >
            {({ pressed }) => (
              <View className={cn('h-11 justify-center rounded-xl px-1', pressed && 'opacity-60')}>
                <Text
                  className="font-medium text-base text-sidebar-foreground"
                  ellipsizeMode="tail"
                  numberOfLines={1}
                >
                  {t('navigation.newChat')}
                </Text>
              </View>
            )}
          </Pressable>
          <Pressable
            accessibilityLabel={t('navigation.settings')}
            accessibilityRole="button"
            accessibilityState={{ disabled: isSelecting || isDeleting, selected: isSettingsOpen }}
            disabled={isSelecting || isDeleting}
            onPress={openSettings}
            style={{ height: appSidebar.dockHeight }}
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
                <SidebarPlanBadge />
              </View>
            )}
          </Pressable>
        </Animated.View>
        <Animated.View
          accessibilityElementsHidden={!isSelecting}
          className="absolute right-0 bottom-0 left-0 flex-row items-center justify-between gap-2"
          importantForAccessibility={isSelecting ? 'auto' : 'no-hide-descendants'}
          pointerEvents={isSelecting ? 'auto' : 'none'}
          style={[selectionStyle, { height: appSidebar.dockHeight }]}
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
