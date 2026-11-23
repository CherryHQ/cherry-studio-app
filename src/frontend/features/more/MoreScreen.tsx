import SettingsIcon from '@cherrystudio/app-icons/icons/settings';
import { type Href, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteHeader } from '@/frontend/appShell/header';
import { isAcross, useFoldRegion, useWindowClass } from '@/frontend/appShell/layout';
import {
  getNavHref,
  getNavTitleKey,
  MAX_MIDDLE_TABS,
  type MoreModuleId,
  NavCardBadge,
  resolveMoreModules,
  useNavigationDockClearance,
  useNavigationShell,
  usePinDragGesture,
} from '@/frontend/appShell/navigationShell';

function chunkItems<T>(items: readonly T[], columns: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}

type MoreModuleCardProps = {
  id: MoreModuleId;
  onPress: () => void;
};

function MoreModuleCard({ id, onPress }: MoreModuleCardProps) {
  const { t } = useTranslation();
  const gesture = usePinDragGesture(id, 'more');

  return (
    <GestureDetector gesture={gesture}>
      <Pressable
        accessibilityLabel={t(getNavTitleKey(id))}
        accessibilityRole="button"
        className="bg-card border-border-subtle min-h-[118px] flex-1 justify-between rounded-3xl border p-4 active:opacity-80"
        onPress={onPress}
        testID={`more-module-card-${id}`}
      >
        <NavCardBadge id={id} />
        <View className="mt-4">
          <Text className="text-foreground text-base font-semibold" numberOfLines={1}>
            {t(getNavTitleKey(id))}
          </Text>
          <Text className="text-muted-foreground mt-0.5 text-xs leading-4" numberOfLines={2}>
            {t(`navigation.moreSubtitle.${id}`)}
          </Text>
        </View>
      </Pressable>
    </GestureDetector>
  );
}

/** Hub for secondary functional modules that are not pinned onto the bottom floating dock. */
export function MoreScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const windowClass = useWindowClass();
  const fold = useFoldRegion();
  const dockClearance = useNavigationDockClearance();
  const { pinnedTabs } = useNavigationShell();

  const modules = useMemo(() => resolveMoreModules(pinnedTabs), [pinnedTabs]);
  const isWideUnfolded = windowClass === 'wide' && !(fold && !isAcross(fold));
  const columns = isWideUnfolded ? 3 : 2;
  const rows = useMemo(() => chunkItems(modules, columns), [columns, modules]);

  const rightActions = useMemo(
    () => [
      {
        accessibilityLabel: t('navigation.settings'),
        icon: SettingsIcon,
        key: 'more-settings',
        onPress: () => router.push('/settings'),
        testID: 'more-settings-button',
        type: 'icon' as const,
      },
    ],
    [router, t],
  );

  return (
    <View className="bg-background flex-1">
      <RouteHeader rightActions={rightActions} title={t('common.more')} />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: insets.bottom + dockClearance + 24,
          paddingHorizontal: 16,
          paddingTop: 12,
        }}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View className="mx-auto w-full max-w-[720px] pb-2">
          {modules.length === 0 ? (
            <View className="flex-1 items-center justify-center py-16">
              <Text className="text-muted-foreground text-center text-sm leading-6">
                {t('navigation.moreEmpty')}
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {rows.map((row) => (
                <View key={row.join('-')} className="flex-row gap-3">
                  {row.map((id) => (
                    <MoreModuleCard
                      key={id}
                      id={id}
                      onPress={() => router.push(getNavHref(id) as Href)}
                    />
                  ))}
                  {row.length < columns
                    ? ([0, 1] as const)
                        .slice(0, columns - row.length)
                        .map((slot) => (
                          <View key={`${row.join('-')}-spacer-${slot}`} className="flex-1" />
                        ))
                    : null}
                </View>
              ))}
            </View>
          )}

          <Text
            className="text-muted-foreground mt-6 text-center text-xs leading-5"
            testID="more-pin-hint"
          >
            {pinnedTabs.length >= MAX_MIDDLE_TABS
              ? t('navigation.moreHintFull')
              : t('navigation.moreHint')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
