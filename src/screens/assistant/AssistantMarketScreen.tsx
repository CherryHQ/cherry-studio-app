import { DrawerActions, useNavigation } from '@react-navigation/native'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'

import { Container, DrawerGestureWrapper, HeaderBar, SafeAreaContainer, SearchInput } from '@/componentsV2'
import { presentAssistantItemSheet } from '@/componentsV2/features/Assistant/AssistantItemSheet'
import AssistantsTabContent from '@/componentsV2/features/Assistant/AssistantsTabContent'
import { Menu } from '@/componentsV2/icons'
import { useBuiltInAssistants } from '@/hooks/useAssistant'
import { useSearch } from '@/hooks/useSearch'
import type { Assistant } from '@/types/assistant'
import type { DrawerNavigationProps } from '@/types/naviagate'

export default function AssistantMarketScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<DrawerNavigationProps>()

  const [isInitializing, setIsInitializing] = useState(true)

  const { assistants: builtInAssistants } = useBuiltInAssistants()
  const {
    searchText,
    setSearchText,
    filteredItems: filteredAssistants
  } = useSearch(
    builtInAssistants,
    useCallback((assistant: Assistant) => [assistant.name || '', assistant.id || ''], [])
  )

  const handleMenuPress = () => {
    navigation.dispatch(DrawerActions.openDrawer())
  }

  const onChatNavigation = async (topicId: string) => {
    navigation.navigate('Home', { screen: 'ChatScreen', params: { topicId } })
  }

  const handleAssistantItemPress = (assistant: Assistant) => {
    presentAssistantItemSheet({
      assistant,
      source: 'builtIn',
      onChatNavigation
    })
  }

  useEffect(() => {
    if (builtInAssistants && builtInAssistants.length > 0 && isInitializing) {
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
      <DrawerGestureWrapper>
        <View collapsable={false} className="flex-1">
          <HeaderBar
            title={t('assistants.market.title')}
            leftButton={{
              icon: <Menu size={24} />,
              onPress: handleMenuPress
            }}
          />
          <Container className="gap-2.5 py-0">
            <SearchInput
              placeholder={t('assistants.market.search_placeholder')}
              value={searchText}
              onChangeText={setSearchText}
            />

            <AssistantsTabContent assistants={filteredAssistants} onAssistantPress={handleAssistantItemPress} />
          </Container>
        </View>
      </DrawerGestureWrapper>
    </SafeAreaContainer>
  )
}
