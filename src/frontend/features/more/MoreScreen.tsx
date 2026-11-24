import SettingsIcon from '@cherrystudio/app-icons/icons/settings';
import { type Href, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
  useNavigationShell,
  useNavigationShellInteraction,
  usePinDragGesture,
  useRootNavigationDockClearance,
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
  isArmed: boolean;
  isDragged: boolean;
  onArmedChange: (id: MoreModuleId, armed: boolean) => void;
  onPress: () => void;
};

function MoreModuleCard({ id, isArmed, isDragged, onArmedChange, onPress }: MoreModuleCardProps) {
  const { t } = useTranslation();
  const handleArmedChange = useCallback(
    (armed: boolean) => onArmedChange(id, armed),
    [id, onArmedChange],
  );
  const gesture = usePinDragGesture(id, 'more', { onArmedChange: handleArmedChange });

  return (
    <GestureDetector gesture={gesture}>
      <Pressable
        accessibilityLabel={t(getNavTitleKey(id))}
        accessibilityRole="button"
        className={`min-h-16 grow flex-row items-center gap-3 rounded-3xl border py-3 pr-4 pl-3 ${
          isDragged
            ? 'bg-secondary/40 border-border-strong border-dashed opacity-35'
            : isArmed
              ? 'bg-popover border-border-selected scale-[0.98] shadow-md'
              : 'bg-card border-border-subtle active:opacity-80'
        }`}
        onPress={onPress}
        testID={`more-module-card-${id}`}
      >
        <NavCardBadge id={id} />
        <Text className="text-foreground min-w-0 flex-1 text-base font-medium" numberOfLines={1}>
          {t(getNavTitleKey(id))}
        </Text>
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
  const dockClearance = useRootNavigationDockClearance();
  const { pinnedTabs } = useNavigationShell();
  const { dragState } = useNavigationShellInteraction();
  const [armedCardId, setArmedCardId] = useState<MoreModuleId | null>(null);

  const handleCardArmedChange = useCallback((id: MoreModuleId, armed: boolean) => {
    setArmedCardId((current) => (armed ? id : current === id ? null : current));
  }, []);

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
          paddingLeft: insets.left + 16,
          paddingRight: insets.right + 16,
          paddingTop: 12,
        }}
        contentInsetAdjustmentBehavior="automatic"
        scrollEnabled={!dragState && !armedCardId}
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
                    <View key={id} className="flex-1">
                      <MoreModuleCard
                        id={id}
                        isArmed={armedCardId === id}
                        isDragged={dragState?.source === 'more' && dragState.id === id}
                        onArmedChange={handleCardArmedChange}
                        onPress={() => router.push(getNavHref(id) as Href)}
                      />
                    </View>
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
