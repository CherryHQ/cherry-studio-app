import { useNavigation } from '@react-navigation/native'
import { FlashList } from '@shopify/flash-list'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'

import { Container, Group, HeaderBar, SafeAreaContainer, SearchInput } from '@/componentsV2'
import { ProviderItem } from '@/componentsV2/features/SettingsScreen/ProviderItem'
import { Plus } from '@/componentsV2/icons'
import { useAllProviders } from '@/hooks/useProviders'
import { useSearch } from '@/hooks/useSearch'
import type { Provider } from '@/types/assistant'
import type { ProvidersNavigationProps } from '@/types/naviagate'

export default function ProviderListScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<ProvidersNavigationProps>()

  const { providers, isLoading } = useAllProviders()

  const {
    searchText,
    setSearchText,
    filteredItems: filteredProviders
  } = useSearch(
    providers,
    useCallback((provider: Provider) => [provider.name || ''], []),
    { delay: 100 }
  )

  const providersList = filteredProviders.filter(p => p.id !== 'cherryai')

  const onAddProvider = () => {
    navigation.navigate('AddProviderScreen', { mode: 'add' })
  }

  const onEditProvider = useCallback(
    (provider: Provider) => {
      navigation.navigate('AddProviderScreen', { mode: 'edit', providerId: provider.id })
    },
    [navigation]
  )

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
              data={providersList}
              renderItem={renderProviderItem}
              keyExtractor={item => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 30 }}
            />
          </Group>
        </Container>
      )}
    </SafeAreaContainer>
  )
}
