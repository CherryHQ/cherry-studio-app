import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import { useNavigation } from '@react-navigation/native'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'

import { Container, HeaderBar, SafeAreaContainer, SearchInput } from '@/componentsV2'
import AssistantItemSheet from '@/componentsV2/features/Assistant/AssistantItemSheet'
import AssistantsTabContent from '@/componentsV2/features/Assistant/AssistantsTabContent'
import { useBuiltInAssistants } from '@/hooks/useAssistant'
import { useSearch } from '@/hooks/useSearch'
import type { Assistant } from '@/types/assistant'
import type { DrawerNavigationProps } from '@/types/naviagate'

export default function AssistantMarketScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<DrawerNavigationProps>()

  const bottomSheetRef = useRef<BottomSheetModal>(null)
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)

  const { builtInAssistants } = useBuiltInAssistants()
  const {
    searchText,
    setSearchText,
    filteredItems: filteredAssistants
  } = useSearch(
    builtInAssistants,
    useCallback((assistant: Assistant) => [assistant.name || '', assistant.id || ''], [])
  )

  const handleAssistantItemPress = (assistant: Assistant) => {
    setSelectedAssistant(assistant)
    bottomSheetRef.current?.present()
  }

  const onChatNavigation = async (topicId: string) => {
    navigation.navigate('Home', { screen: 'ChatScreen', params: { topicId } })
  }

  useEffect(() => {
    if (builtInAssistants.length > 0 && isInitializing) {
      const id = setTimeout(() => {
        setIsInitializing(false)
      }, 100)
      return () => clearTimeout(id)
    }
  }, [builtInAssistants, isInitializing])

  if (isInitializing) {
    return (
      <SafeAreaContainer style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </SafeAreaContainer>
    )
  }

  return (
    <SafeAreaContainer className="pb-0">
      <View collapsable={false} className="flex-1">
        <HeaderBar title={t('assistants.market.title')} />
        <Container className="gap-2.5 py-0">
          <SearchInput
            placeholder={t('assistants.market.search_placeholder')}
            value={searchText}
            onChangeText={setSearchText}
          />

          <AssistantsTabContent assistants={filteredAssistants} onAssistantPress={handleAssistantItemPress} />
        </Container>
        <AssistantItemSheet
          ref={bottomSheetRef}
          assistant={selectedAssistant}
          source="builtIn"
          onChatNavigation={onChatNavigation}
        />
      </View>
    </SafeAreaContainer>
  )
}
