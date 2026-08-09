import { SearchField, Section } from '@cherrystudio/ui/components';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { PlusIcon } from 'lucide-uniwind/png';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';

import { BackHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import { useQuery } from '@/frontend/data';
import { hiddenProviderListIds, isIOS } from '@/frontend/utils/constants';

import { ProviderCard, type ProviderCardProps } from './components/ProviderCard';

const providerListStaleTime = 1000 * 60 * 5;
const usesNativeBottomSearch = isIOS && Number.parseInt(String(Platform.Version), 10) >= 26;
const PROVIDER_CARD_GAP = 12;
const PROVIDER_CARD_ESTIMATED_HEIGHT = 160;
const PROVIDER_COLUMN_COUNT = 2;

const keyExtractor = (item: ProviderCardProps) => item.provider.id;
const renderProviderCard = ({ item }: LegendListRenderItemProps<ProviderCardProps>) => (
  <ProviderCard {...item} />
);

export default function ProviderSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [searchText, setSearchText] = useState('');
  const [isNativeSearchFocused, setIsNativeSearchFocused] = useState(false);
  const isNavigatingRef = useRef(false);
  const hasFocusedOnceRef = useRef(false);

  useFocusEffect(() => {
    if (!hasFocusedOnceRef.current) {
      hasFocusedOnceRef.current = true;
      return;
    }
    isNavigatingRef.current = false;
  });

  const providersQuery = useQuery('/providers', {
    staleTime: providerListStaleTime,
  });
  const providerItems = useMemo<ProviderCardProps[]>(
    () =>
      (providersQuery.data ?? [])
        .filter((provider) => !hiddenProviderListIds.includes(provider.id))
        // Enabled providers float to the top; the sort is stable, so each group
        // keeps the `orderKey` order the service already applied.
        .sort((a, b) => Number(b.isEnabled) - Number(a.isEnabled))
        .map((provider) => ({
          provider,
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
        })),
    [providersQuery.data, router, t],
  );
  const filteredProviderItems = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();
    const matches = query
      ? providerItems.filter((item) => item.provider.name.toLocaleLowerCase().includes(query))
      : providerItems;

    return matches;
  }, [providerItems, searchText]);
  const [measuredList, setMeasuredList] = useState<{ height: number; rowCount: number }>();
  const handleContentSizeChange = useCallback(
    (_width: number, height: number) =>
      setMeasuredList({ height, rowCount: filteredProviderItems.length }),
    [filteredProviderItems.length],
  );
  const cardHeight =
    measuredList?.rowCount === filteredProviderItems.length
      ? measuredList.height
      : Math.ceil(filteredProviderItems.length / PROVIDER_COLUMN_COUNT) *
          PROVIDER_CARD_ESTIMATED_HEIGHT +
        Math.max(0, Math.ceil(filteredProviderItems.length / PROVIDER_COLUMN_COUNT) - 1) *
          PROVIDER_CARD_GAP;
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
      {usesNativeBottomSearch ? (
        <>
          <Stack.SearchBar
            allowToolbarIntegration
            autoCapitalize="none"
            hideWhenScrolling={false}
            obscureBackground={false}
            placeholder={t('navigation.search')}
            placement="integrated"
            onBlur={() => setIsNativeSearchFocused(false)}
            onCancelButtonPress={() => {
              setIsNativeSearchFocused(false);
              setSearchText('');
            }}
            onChangeText={(event) => setSearchText(event.nativeEvent.text)}
            onFocus={() => setIsNativeSearchFocused(true)}
          />
          <Stack.Toolbar placement="bottom">
            <Stack.Toolbar.SearchBarSlot />
          </Stack.Toolbar>
        </>
      ) : null}
      <Pressable
        accessible={false}
        className="flex-1 gap-3 px-4 pb-5"
        onPress={Keyboard.dismiss}
        style={{ paddingTop: isNativeSearchFocused ? 12 : 0 }}
      >
        {usesNativeBottomSearch ? null : (
          <SearchField
            accessibilityLabel={t('navigation.search')}
            clearAccessibilityLabel={t('common.clear')}
            onChangeText={setSearchText}
            onClear={() => setSearchText('')}
            placeholder={t('navigation.search')}
            value={searchText}
          />
        )}
        {filteredProviderItems.length > 0 ? (
          <View className="min-h-0 flex-1">
            <View style={{ height: cardHeight, maxHeight: '100%' }}>
              <LegendList
                alwaysBounceVertical={false}
                contentContainerStyle={
                  usesNativeBottomSearch ? styles.listContentWithNativeBottomSearch : undefined
                }
                columnWrapperStyle={styles.cardGrid}
                data={filteredProviderItems}
                estimatedItemSize={PROVIDER_CARD_ESTIMATED_HEIGHT}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                keyExtractor={keyExtractor}
                maintainVisibleContentPosition={false}
                numColumns={PROVIDER_COLUMN_COUNT}
                onContentSizeChange={handleContentSizeChange}
                recycleItems
                renderItem={renderProviderCard}
                showsVerticalScrollIndicator={false}
                style={styles.list}
              />
            </View>
          </View>
        ) : (
          <Section>
            <Section.Item
              label={
                providersQuery.isPending
                  ? t('settings.provider.loading')
                  : t('settings.provider.search.empty')
              }
            />
          </Section>
        )}
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  cardGrid: {
    gap: PROVIDER_CARD_GAP,
  },
  list: {
    flex: 1,
  },
  listContentWithNativeBottomSearch: {
    paddingBottom: 96,
  },
});
