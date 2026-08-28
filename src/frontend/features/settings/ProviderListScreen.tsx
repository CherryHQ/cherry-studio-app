import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import { Section } from '@cherrystudio/ui/components';
import { SectionList } from '@legendapp/list/section-list';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import { InlineSearch, useInlineSearch } from '@/frontend/components/inlineSearch';
import { useQuery } from '@/frontend/data';
import type { Provider } from '@/shared/data/types/provider';

import { ProviderAvatar } from './components/ProviderAvatar';
import { SettingsServiceRow, type SettingsServiceRowProps } from './components/SettingsServiceRow';
const providerListStaleTime = 1000 * 60 * 5;
const PROVIDER_ROW_ESTIMATED_HEIGHT = 50;
const PROVIDER_SECTION_HEADER_ESTIMATED_HEIGHT = 48;

type ProviderListRow = SettingsServiceRowProps & { isEnabled: boolean };
type ProviderListSection = { data: ProviderListRow[]; title: string };

const keyExtractor = (item: ProviderListRow) => item.id;
const renderProviderRow = ({ item }: { item: ProviderListRow }) => {
  const { isEnabled: _isEnabled, ...row } = item;

  return <SettingsServiceRow {...row} />;
};
const renderProviderSectionHeader = ({ section }: { section: ProviderListSection }) => (
  <View className="h-12 justify-end px-4 pb-2">
    <Text className="font-medium text-foreground-tertiary text-sm">{section.title}</Text>
  </View>
);

export default function ProviderSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
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
  const providers = useMemo(() => providersQuery.data ?? [], [providersQuery.data]);
  const openProvider = useCallback(
    (provider: Provider) => {
      if (isNavigatingRef.current) {
        return;
      }

      isNavigatingRef.current = true;
      router.push({
        pathname: '/settings/provider/[providerId]',
        params: { providerId: provider.id, providerName: provider.name },
      });
    },
    [router],
  );
  const providerItems = useMemo<ProviderListRow[]>(
    () =>
      providers.map((provider) => ({
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
        onPress: () => openProvider(provider),
      })),
    [openProvider, providers],
  );
  const {
    query,
    results: listedProviderItems,
    setQuery,
  } = useInlineSearch({
    fields: (item: ProviderListRow) => [item.name],
    items: providerItems,
  });
  const providerSections = useMemo<ProviderListSection[]>(() => {
    const enabledProviders = listedProviderItems.filter(({ isEnabled }) => isEnabled);
    const disabledProviders = listedProviderItems.filter(({ isEnabled }) => !isEnabled);

    return [
      {
        data: enabledProviders,
        title: t('settings.provider.section.enabled', {
          count: enabledProviders.length,
        }),
      },
      {
        data: disabledProviders,
        title: t('settings.provider.section.disabled', {
          count: disabledProviders.length,
        }),
      },
    ].filter(({ data }) => data.length > 0);
  }, [listedProviderItems, t]);
  const measuredItemCount = listedProviderItems.length + providerSections.length;
  const [measuredList, setMeasuredList] = useState<{ height: number; itemCount: number }>();
  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => setMeasuredList({ height, itemCount: measuredItemCount }),
    [measuredItemCount],
  );
  const cardHeight =
    measuredList?.itemCount === measuredItemCount
      ? measuredList.height
      : listedProviderItems.length * PROVIDER_ROW_ESTIMATED_HEIGHT +
        providerSections.length * PROVIDER_SECTION_HEADER_ESTIMATED_HEIGHT;
  const openCreateProvider = useCallback(() => {
    router.push('/settings/provider/new');
  }, [router]);
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('settings.provider.add.title'),
        icon: PlusIcon,
        key: 'create-provider',
        onPress: openCreateProvider,
        type: 'icon',
      },
    ],
    [openCreateProvider, t],
  );

  return (
    <>
      <RouteHeader rightActions={rightActions} title={t('settings.pages.provider.title')} />
      <InlineSearch onChangeText={setQuery} value={query} />
      <View className="flex-1 px-4 pb-5">
        {listedProviderItems.length > 0 ? (
          <View className="-mx-4 min-h-0 flex-1">
            <View style={{ height: cardHeight, maxHeight: '100%' }}>
              <SectionList
                alwaysBounceVertical={false}
                estimatedItemSize={PROVIDER_ROW_ESTIMATED_HEIGHT}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                keyExtractor={keyExtractor}
                maintainVisibleContentPosition={false}
                onContentSizeChange={handleContentSizeChange}
                recycleItems
                renderItem={renderProviderRow}
                renderSectionHeader={renderProviderSectionHeader}
                sections={providerSections}
                showsVerticalScrollIndicator={false}
                stickySectionHeadersEnabled={false}
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
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
});
