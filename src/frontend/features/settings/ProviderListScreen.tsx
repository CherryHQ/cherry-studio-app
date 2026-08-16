import { PlusIcon } from '@cherrystudio/app-icons';
import { Section } from '@cherrystudio/ui/components';
import { SectionList } from '@legendapp/list/section-list';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { BackHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import { useQuery } from '@/frontend/data';
import { hiddenProviderListIds } from '@/frontend/utils/constants';

import { ProviderAvatar } from './components/ProviderAvatar';
import { SettingsServiceRow, type SettingsServiceRowProps } from './components/SettingsServiceRow';
import {
  ProviderListSearch,
  providerListContentContainerStyle,
} from './ProviderListSearch/ProviderListSearch';

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

  const providersQuery = useQuery('/providers', {
    staleTime: providerListStaleTime,
  });
  const providerItems = useMemo<ProviderListRow[]>(
    () =>
      (providersQuery.data ?? [])
        .filter((provider) => !hiddenProviderListIds.includes(provider.id))
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
        })),
    [providersQuery.data, router],
  );
  const filteredProviderItems = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();
    const matches = query
      ? providerItems.filter((item) => item.name.toLocaleLowerCase().includes(query))
      : providerItems;

    return matches;
  }, [providerItems, searchText]);
  const providerSections = useMemo<ProviderListSection[]>(() => {
    const enabledProviders = filteredProviderItems.filter(({ isEnabled }) => isEnabled);
    const disabledProviders = filteredProviderItems.filter(({ isEnabled }) => !isEnabled);

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
  }, [filteredProviderItems, t]);
  const measuredItemCount = filteredProviderItems.length + providerSections.length;
  const [measuredList, setMeasuredList] = useState<{ height: number; itemCount: number }>();
  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => setMeasuredList({ height, itemCount: measuredItemCount }),
    [measuredItemCount],
  );
  const cardHeight =
    measuredList?.itemCount === measuredItemCount
      ? measuredList.height
      : filteredProviderItems.length * PROVIDER_ROW_ESTIMATED_HEIGHT +
        providerSections.length * PROVIDER_SECTION_HEADER_ESTIMATED_HEIGHT;
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
      <ProviderListSearch searchText={searchText} setSearchText={setSearchText}>
        {filteredProviderItems.length > 0 ? (
          <View className="-mx-4 min-h-0 flex-1">
            <View style={{ height: cardHeight, maxHeight: '100%' }}>
              <SectionList
                alwaysBounceVertical={false}
                contentContainerStyle={providerListContentContainerStyle}
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
      </ProviderListSearch>
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
});
