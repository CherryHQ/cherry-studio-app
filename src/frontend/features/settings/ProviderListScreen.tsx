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

import { ProviderAvatar } from './components/ProviderAvatar';
import { SettingsServiceRow, type SettingsServiceRowProps } from './components/SettingsServiceRow';

const providerListStaleTime = 1000 * 60 * 5;
const usesNativeBottomSearch = isIOS && Number.parseInt(String(Platform.Version), 10) >= 26;
const PROVIDER_ROW_ESTIMATED_HEIGHT = 44;

const keyExtractor = (item: SettingsServiceRowProps) => item.id;
const renderProviderRow = ({ item }: LegendListRenderItemProps<SettingsServiceRowProps>) => (
  <SettingsServiceRow {...item} />
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

    return matches.map((item, index) => ({ ...item, showSeparator: index > 0 }));
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
      : filteredProviderItems.length * PROVIDER_ROW_ESTIMATED_HEIGHT;
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
            <View
              className="overflow-hidden rounded-2xl bg-settings-grouped-surface"
              style={{ height: cardHeight, maxHeight: '100%' }}
            >
              <LegendList
                alwaysBounceVertical={false}
                data={filteredProviderItems}
                estimatedItemSize={PROVIDER_ROW_ESTIMATED_HEIGHT}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                keyExtractor={keyExtractor}
                maintainVisibleContentPosition={false}
                onContentSizeChange={handleContentSizeChange}
                recycleItems
                renderItem={renderProviderRow}
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
  list: {
    flex: 1,
  },
});
