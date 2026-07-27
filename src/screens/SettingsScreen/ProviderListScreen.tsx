import { useFocusEffect, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { Accordion } from 'heroui-native/accordion';
import { SearchField } from 'heroui-native/search-field';
import { PlusIcon } from 'lucide-uniwind/png';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackHeader, type HeaderToolbarAction } from '@/components/headers';
import { isLiquidGlassAvailable } from '@/config/constants';
import { queryKeys } from '@/data/api';
import { useDataQuery } from '@/data/hooks';
import { ProviderAvatar } from './components/ProviderAvatar';
import { SettingsSection } from './components/SettingsSection';
import { SettingsServiceRow, type SettingsServiceRowProps } from './components/SettingsServiceRow';

const providerListStaleTime = 1000 * 60 * 5;

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
      (providersQuery.data ?? []).map((provider) => ({
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
  const enabledProviderItems = useMemo(
    () => providerItems.filter((item) => item.isEnabled),
    [providerItems],
  );
  const disabledProviderItems = useMemo(
    () => providerItems.filter((item) => !item.isEnabled),
    [providerItems],
  );
  const filteredProviderItems = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();

    return query
      ? enabledProviderItems.filter((item) => item.name.toLocaleLowerCase().includes(query))
      : enabledProviderItems;
  }, [enabledProviderItems, searchText]);
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
        className="flex-1 gap-3 px-4"
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
        <ScrollView
          alwaysBounceVertical={false}
          className="flex-1"
          contentContainerClassName="gap-3 pb-5"
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {filteredProviderItems.length > 0 ? (
            <View className="overflow-hidden rounded-xl bg-settings-grouped-surface">
              {filteredProviderItems.map((item) => (
                <SettingsServiceRow key={item.id} {...item} />
              ))}
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
          {searchText.trim() || disabledProviderItems.length === 0 ? null : (
            <DisabledProvidersAccordion items={disabledProviderItems} />
          )}
        </ScrollView>
      </Pressable>
    </>
  );
}

function DisabledProvidersAccordion({ items }: { items: SettingsServiceRowProps[] }) {
  const { t } = useTranslation();

  return (
    <Accordion
      className="overflow-hidden rounded-xl bg-settings-grouped-surface"
      hideSeparator
      isCollapsible
      selectionMode="single"
    >
      <Accordion.Item value="disabled-providers">
        <Accordion.Trigger className="min-h-11 px-3 py-3">
          <View className="flex-1 flex-row items-center gap-2">
            <Text className="font-medium text-default-foreground text-sm">
              {t('settings.provider.disabled.title')}
            </Text>
            <Text className="text-default-foreground text-sm">{items.length}</Text>
          </View>
          <Accordion.Indicator iconProps={{ size: 18 }} />
        </Accordion.Trigger>
        <Accordion.Content className="px-0 pb-0">
          {items.map((item) => (
            <SettingsServiceRow key={item.id} {...item} />
          ))}
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  );
}

const styles = StyleSheet.create({
  searchInput: {
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
