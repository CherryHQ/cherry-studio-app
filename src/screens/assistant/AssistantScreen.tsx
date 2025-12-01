import { DrawerActions, useNavigation } from '@react-navigation/native'
import { FlashList } from '@shopify/flash-list'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'

import { Container, HeaderBar, SafeAreaContainer, SearchInput, Text, YStack } from '@/componentsV2'
import AssistantItem from '@/componentsV2/features/Assistant/AssistantItem'
import { presentAssistantItemSheet } from '@/componentsV2/features/Assistant/AssistantItemSheet'
import { Plus } from '@/componentsV2/icons/LucideIcon'
import { useAssistants } from '@/hooks/useAssistant'
import { useSearch } from '@/hooks/useSearch'
import { createAssistant } from '@/services/AssistantService'
import type { Assistant } from '@/types/assistant'
import type { DrawerNavigationProps } from '@/types/naviagate'

export default function AssistantScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<DrawerNavigationProps>()

  const { assistants, isLoading } = useAssistants()

  const {
    searchText,
    setSearchText,
    filteredItems: filteredAssistants
  } = useSearch(
    assistants,
    useCallback((assistant: Assistant) => [assistant.name, assistant.description || ''], []),
    { delay: 100 }
  )

  const handleEditAssistant = (assistantId: string) => {
    navigation.navigate('Assistant', { screen: 'AssistantDetailScreen', params: { assistantId } })
  }

  const onChatNavigation = async (topicId: string) => {
    navigation.navigate('Home', { screen: 'ChatScreen', params: { topicId } })
  }

  const handleAssistantItemPress = (assistant: Assistant) => {
    presentAssistantItemSheet({
      assistant,
      source: 'external',
      onEdit: handleEditAssistant,
      onChatNavigation
    })
  }

  const onNavigateToMarketScreen = () => {
    navigation.navigate('AssistantMarket', { screen: 'AssistantMarketScreen' })
  }

  const onAddAssistant = async () => {
    const newAssistant = await createAssistant()
    navigation.navigate('Assistant', { screen: 'AssistantDetailScreen', params: { assistantId: newAssistant.id } })
  }

  const handleMenuPress = () => {
    navigation.dispatch(DrawerActions.openDrawer())
  }

  if (isLoading) {
    return (
      <SafeAreaContainer style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </SafeAreaContainer>
    )
  }

  return (
    <SafeAreaContainer className="pb-0">
      <View collapsable={false} className="flex-1">
        <HeaderBar
          title={t('assistants.title.mine')}
          rightButtons={[
            {
              icon: <Plus size={24} />,
              onPress: onAddAssistant
            }
          ]}
        />
        <Container className="p-0">
          <View className="px-4">
            <SearchInput placeholder={t('common.search_placeholder')} value={searchText} onChangeText={setSearchText} />
          </View>
          <FlashList
            showsVerticalScrollIndicator={false}
            data={filteredAssistants}
            renderItem={({ item }) => <AssistantItem assistant={item} onAssistantPress={handleAssistantItemPress} />}
            keyExtractor={item => item.id}
            ItemSeparatorComponent={() => <YStack className="h-2" />}
            ListEmptyComponent={
              <YStack className="flex-1 items-center justify-center">
                <Text>{t('settings.assistant.empty')}</Text>
              </YStack>
            }
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
          />
        </Container>
      </View>
    </SafeAreaContainer>
  )
}
