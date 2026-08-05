import { SearchField, Section } from '@cherrystudio/ui/components';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { PlusIcon } from 'lucide-uniwind/png';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { BackHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import { useQuery } from '@/frontend/data';
import { hiddenProviderListIds, isIOS } from '@/frontend/utils/constants';

import { ProviderAvatar } from './components/ProviderAvatar';

const providerListStaleTime = 1000 * 60 * 5;
const usesNativeBottomSearch = isIOS && Number.parseInt(String(Platform.Version), 10) >= 26;

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
  const providerItems = useMemo(
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
        })),
    [providersQuery.data, router, t],
  );
  const filteredProviderItems = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();
    return query
      ? providerItems.filter((item) => item.name.toLocaleLowerCase().includes(query))
      : providerItems;
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
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerClassName="grow px-4 pb-5"
        contentContainerStyle={{ paddingTop: isNativeSearchFocused ? 12 : 0 }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable accessible={false} className="flex-1 gap-3" onPress={Keyboard.dismiss}>
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
          <Section>
            {filteredProviderItems.length > 0 ? (
              filteredProviderItems.map((item) => (
                <Section.Item
                  key={item.id}
                  label={item.name}
                  leading={item.avatar}
                  onPress={item.onPress}
                  showChevron
                  trailing={
                    item.statusLabel ? (
                      <View
                        className="h-5 items-center justify-center rounded-lg border px-1.5"
                        style={{ backgroundColor: '#00b96b20', borderColor: '#00b96b66' }}
                      >
                        <Text
                          className="font-medium text-xs"
                          numberOfLines={1}
                          style={{ color: '#00b96b' }}
                        >
                          {item.statusLabel}
                        </Text>
                      </View>
                    ) : undefined
                  }
                />
              ))
            ) : (
              <Section.Item
                label={
                  providersQuery.isPending
                    ? t('settings.provider.loading')
                    : t('settings.provider.search.empty')
                }
              />
            )}
          </Section>
        </Pressable>
      </ScrollView>
    </>
  );
}
