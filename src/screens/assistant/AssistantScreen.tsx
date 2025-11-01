import { BottomSheetModal } from '@gorhom/bottom-sheet'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import React, { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'

import {
  DrawerGestureWrapper,
  SafeAreaContainer,
  Container,
  HeaderBar,
  Text,
  YStack,
  SearchInput
} from '@/componentsV2'
import { Menu, Plus, Store } from '@/componentsV2/icons/LucideIcon'
import { useExternalAssistants } from '@/hooks/useAssistant'
import { useSearch } from '@/hooks/useSearch'
import { createAssistant } from '@/services/AssistantService'
import { Assistant } from '@/types/assistant'
import { DrawerNavigationProps } from '@/types/naviagate'
import AssistantItem from '@/componentsV2/features/Assistant/AssistantItem'
import AssistantItemSheet from '@/componentsV2/features/Assistant/AssistantItemSheet'
import { FlashList } from '@shopify/flash-list'

export default function AssistantScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<DrawerNavigationProps>()

  const { assistants, isLoading } = useExternalAssistants()

  const {
    searchText,
    setSearchText,
    filteredItems: filteredAssistants
  } = useSearch(
    assistants,
    useCallback((assistant: Assistant) => [assistant.name, assistant.description || ''], []),
    { delay: 100 }
  )

  const bottomSheetRef = useRef<BottomSheetModal>(null)
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null)

  const handleAssistantItemPress = (assistant: Assistant) => {
    setSelectedAssistant(assistant)
    bottomSheetRef.current?.present()
  }

  const onNavigateToMarketScreen = () => {
    navigation.navigate('Assistant', { screen: 'AssistantMarketScreen' })
  }

  const onAddAssistant = async () => {
    const newAssistant = await createAssistant()
    navigation.navigate('Assistant', { screen: 'AssistantDetailScreen', params: { assistantId: newAssistant.id } })
  }

  const handleMenuPress = () => {
    navigation.dispatch(DrawerActions.openDrawer())
  }

  const handleEditAssistant = (assistantId: string) => {
    navigation.navigate('Assistant', { screen: 'AssistantDetailScreen', params: { assistantId } })
  }

  const onChatNavigation = async (topicId: string) => {
    navigation.navigate('Home', { screen: 'ChatScreen', params: { topicId } })
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
      <DrawerGestureWrapper>
        <View collapsable={false} className="flex-1">
          <HeaderBar
            title={t('assistants.title.mine')}
            leftButton={{
              icon: <Menu size={24} />,
              onPress: handleMenuPress
            }}
            rightButtons={[
              {
                icon: <Store size={24} />,
                onPress: onNavigateToMarketScreen
              },
              {
                icon: <Plus size={24} />,
                onPress: onAddAssistant
              }
            ]}
          />
          <Container className="p-0">
            <View className="px-4">
              <SearchInput
                placeholder={t('common.search_placeholder')}
                value={searchText}
                onChangeText={setSearchText}
              />
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
          <AssistantItemSheet
            ref={bottomSheetRef}
            assistant={selectedAssistant}
            source="external"
            onEdit={handleEditAssistant}
            onChatNavigation={onChatNavigation}
          />
        </View>
      </DrawerGestureWrapper>
    </SafeAreaContainer>
  )
}
