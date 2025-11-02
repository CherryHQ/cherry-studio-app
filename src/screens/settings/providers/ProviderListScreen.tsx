import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import { FlashList } from '@shopify/flash-list'
import React, { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'

import { Container, Group, HeaderBar, SafeAreaContainer, SearchInput } from '@/componentsV2'
import { AddProviderSheet } from '@/componentsV2/features/SettingsScreen/AddProviderSheet'
import { ProviderItem } from '@/componentsV2/features/SettingsScreen/ProviderItem'
import { Plus } from '@/componentsV2/icons'
import { useAllProviders } from '@/hooks/useProviders'
import { useSearch } from '@/hooks/useSearch'
import type { Provider } from '@/types/assistant'

export default function ProviderListScreen() {
  const { t } = useTranslation()

  const bottomSheetRef = useRef<BottomSheetModal>(null)
  const { providers, isLoading } = useAllProviders()

  const [sheetMode, setSheetMode] = useState<'add' | 'edit'>('add')
  const [editingProvider, setEditingProvider] = useState<Provider | undefined>(undefined)

  const {
    searchText,
    setSearchText,
    filteredItems: filteredProviders
  } = useSearch(
    providers,
    useCallback((provider: Provider) => [provider.name || ''], []),
    { delay: 100 }
  )

  const onAddProvider = useCallback(() => {
    setSheetMode('add')
    setEditingProvider(undefined)
    bottomSheetRef.current?.present()
  }, [])

  const onEditProvider = useCallback((provider: Provider) => {
    setSheetMode('edit')
    setEditingProvider(provider)
    bottomSheetRef.current?.present()
  }, [])

  const renderProviderItem = useCallback(
    ({ item }: { item: Provider }) => (
      <ProviderItem provider={item} mode={item.enabled ? 'enabled' : 'checked'} onEdit={onEditProvider} />
    ),
    [onEditProvider]
  )

  return (
    <SafeAreaContainer>
      <HeaderBar
        title={t('settings.provider.list.title')}
        rightButton={{
          icon: <Plus size={24} />,
          onPress: onAddProvider
        }}
      />
      {isLoading ? (
        <SafeAreaContainer style={{ alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </SafeAreaContainer>
      ) : (
        <Container className="gap-4 pb-0">
          <SearchInput placeholder={t('settings.provider.search')} value={searchText} onChangeText={setSearchText} />

          <Group className="flex-1">
            <FlashList
              data={filteredProviders}
              renderItem={renderProviderItem}
              keyExtractor={item => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 30 }}
            />
          </Group>
        </Container>
      )}

      <AddProviderSheet ref={bottomSheetRef} mode={sheetMode} editProvider={editingProvider} />
    </SafeAreaContainer>
  )
}
