import { resolveProviderIcon } from '@cherrystudio/ui/icons-png/providers';
import { useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { Accordion } from 'heroui-native/accordion';
import { SearchField } from 'heroui-native/search-field';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useUniwind, withUniwind } from 'uniwind';

import { BackHeader } from '@/components/headers';
import { isLiquidGlassAvailable } from '@/config/constants';
import { useDataQuery } from '@/data/hooks';
import { queryKeys } from '@/data/queries';
import { SettingsSection } from './components/SettingsSection';
import { SettingsServiceRow, type SettingsServiceRowProps } from './components/SettingsServiceRow';

const StyledPressable = withUniwind(Pressable);

const providerListStaleTime = 1000 * 60 * 5;

export default function ProviderSettingsScreen() {
  const { t } = useTranslation();
  const headerHeight = useHeaderHeight();
  const router = useRouter();
  const { theme } = useUniwind();
  const iconTheme = theme === 'dark' ? 'dark' : 'light';
  const topInset = isLiquidGlassAvailable ? headerHeight : 0;
  const [searchText, setSearchText] = useState('');
  const providersQuery = useDataQuery({
    queryKey: queryKeys.providers.list(),
    queryFn: (services) => services.provider.list(),
    staleTime: providerListStaleTime,
  });
  const providerItems = useMemo<SettingsServiceRowProps[]>(
    () =>
      (providersQuery.data ?? []).map((provider) => {
        const iconSource = resolveProviderIcon(provider.presetProviderId ?? provider.id);

        return {
          id: provider.id,
          imageSource: iconSource?.[iconTheme],
          isEnabled: provider.isEnabled,
          name: provider.name,
          onPress: () =>
            router.push({
              pathname: '/settings/provider/[providerId]',
              params: { providerId: provider.id, providerName: provider.name },
            }),
        };
      }),
    [iconTheme, providersQuery.data, router],
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

  return (
    <>
      <BackHeader title={t('settings.pages.provider.title')} />
      <StyledPressable
        accessible={false}
        className="flex-1 gap-3 bg-background px-4"
        onPress={Keyboard.dismiss}
        style={{ paddingTop: topInset }}
      >
        <SearchField className="w-full" onChange={setSearchText} value={searchText}>
          <SearchField.Group className="h-10">
            <SearchField.SearchIcon iconProps={{ size: 18 }} />
            <SearchField.Input
              accessibilityLabel={t('navigation.search')}
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
              className="h-10 min-h-10 rounded-3xl border-0 py-0 pl-9 pr-3 text-base leading-5"
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
          contentContainerStyle={styles.listContent}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.list}
        >
          {filteredProviderItems.length > 0 ? (
            <View className="overflow-hidden bg-surface-secondary">
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
      </StyledPressable>
    </>
  );
}

function DisabledProvidersAccordion({ items }: { items: SettingsServiceRowProps[] }) {
  const { t } = useTranslation();

  return (
    <Accordion className="bg-surface-secondary" hideSeparator isCollapsible selectionMode="single">
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
  list: {
    flex: 1,
  },
  listContent: {
    gap: 12,
    paddingBottom: 20,
  },
  searchInput: {
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
