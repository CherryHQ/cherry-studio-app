import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { SearchField } from 'heroui-native/search-field';
import { PlusIcon } from 'lucide-uniwind/png';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { BackHeader, type HeaderToolbarAction } from '@/components/headers';
import {
  hiddenProviderListIds,
  isLiquidGlassAvailable,
  settingsServiceRow,
} from '@/config/constants';
import { queryKeys } from '@/data/api';
import { useDataQuery } from '@/data/hooks';
import { ProviderAvatar } from './components/ProviderAvatar';
import { SettingsSection } from './components/SettingsSection';
import { SettingsServiceRow, type SettingsServiceRowProps } from './components/SettingsServiceRow';

const providerListStaleTime = 1000 * 60 * 5;

const keyExtractor = (item: SettingsServiceRowProps) => item.id;
const renderProviderRow = ({ item }: LegendListRenderItemProps<SettingsServiceRowProps>) => (
  <SettingsServiceRow {...item} />
);

export default function ProviderSettingsScreen() {
  const { t } = useTranslation();
  const headerHeight = useHeaderHeight();
  const router = useRouter();
  const topInset = isLiquidGlassAvailable ? headerHeight : 0;
  const [searchText, setSearchText] = useState('');
  const isNavigatingRef = useRef(false);
  const hasFocusedOnceRef = useRef(false);

  useFocusEffect(() => {
    if (!hasFocusedOnceRef.current) {
      hasFocusedOnceRef.current = true;
      return;
    }
    isNavigatingRef.current = false;
  });

  const providersQuery = useDataQuery({
    queryKey: queryKeys.providers.list(),
    queryFn: (services) => services.provider.list(),
    staleTime: providerListStaleTime,
  });
  const providerItems = useMemo<SettingsServiceRowProps[]>(
    () =>
      (providersQuery.data ?? [])
        .filter((provider) => !hiddenProviderListIds.includes(provider.id))
        // Enabled providers float to the top; the sort is stable, so each group
        // keeps the `orderKey` order the service already applied.
        .sort((a, b) => Number(b.isEnabled) - Number(a.isEnabled))
        .map((provider) => ({
          avatar: (
            <ProviderAvatar
              presetProviderId={provider.presetProviderId}
              providerId={provider.id}
              providerName={provider.name}
            />
          ),
          id: provider.id,
          isEnabled: provider.isEnabled,
          name: provider.name,
          onPress: () => {
            if (isNavigatingRef.current) {
              return;
            }
            isNavigatingRef.current = true;
            router.push({
              pathname: '/settings/provider/[providerId]',
              params: { providerId: provider.id, providerName: provider.name },
            });
          },
          statusLabel: provider.isEnabled ? t('settings.provider.status.enabled') : undefined,
          statusTone: 'success',
        })),
    [providersQuery.data, router, t],
  );
  const filteredProviderItems = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();
    const matches = query
      ? providerItems.filter((item) => item.name.toLocaleLowerCase().includes(query))
      : providerItems;

    // Stamp the separator onto the row data instead of deriving it from
    // `renderItem`'s `index`: a recycled LegendList row keeps its previous index
    // when the list shrinks, which resurrects the separator above the first row.
    return matches.map((item, index) => ({ ...item, showSeparator: index > 0 }));
  }, [providerItems, searchText]);
  const openCreateProvider = useCallback(() => {
    router.push('/settings/provider/new');
  }, [router]);
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('settings.provider.add.title'),
        androidIcon: PlusIcon,
        icon: 'plus',
        key: 'create-provider',
        onPress: openCreateProvider,
      },
    ],
    [openCreateProvider, t],
  );

  return (
    <>
      <BackHeader rightActions={rightActions} title={t('settings.pages.provider.title')} />
      <Pressable
        accessible={false}
        className="flex-1 gap-3 px-4 pb-5"
        onPress={Keyboard.dismiss}
        style={{ paddingTop: topInset }}
      >
        <SearchField className="w-full" onChange={setSearchText} value={searchText}>
          <SearchField.Group className="h-10 rounded-xl bg-settings-grouped-surface">
            <SearchField.SearchIcon iconProps={{ size: 18 }} />
            <SearchField.Input
              accessibilityLabel={t('navigation.search')}
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
              className="h-10 min-h-10 rounded-xl border-0 bg-transparent py-0 pl-9 pr-3 text-base leading-5"
              placeholder={t('navigation.search')}
              returnKeyType="search"
              spellCheck={false}
              style={styles.searchInput}
              textContentType="none"
            />
          </SearchField.Group>
        </SearchField>
        {filteredProviderItems.length > 0 ? (
          <View className="flex-1 overflow-hidden rounded-xl bg-settings-grouped-surface">
            <LegendList
              alwaysBounceVertical={false}
              data={filteredProviderItems}
              estimatedItemSize={settingsServiceRow.rowHeight}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              keyExtractor={keyExtractor}
              recycleItems
              renderItem={renderProviderRow}
              showsVerticalScrollIndicator={false}
            />
          </View>
        ) : (
          <SettingsSection
            items={[
              {
                hideAccessory: true,
                title: providersQuery.isPending
                  ? t('settings.provider.loading')
                  : t('settings.provider.search.empty'),
              },
            ]}
          />
        )}
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  searchInput: {
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
