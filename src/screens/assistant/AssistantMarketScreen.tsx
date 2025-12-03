import { DrawerActions, useNavigation } from '@react-navigation/native'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  Container,
  DrawerGestureWrapper,
  GridSkeleton,
  HeaderBar,
  SafeAreaContainer,
  SearchInput
} from '@/componentsV2'
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

  const { assistants: builtInAssistants } = useBuiltInAssistants()
  const {
    searchText,
    setSearchText,
    filteredItems: filteredAssistants
  } = useSearch(
    builtInAssistants,
    useCallback((assistant: Assistant) => [assistant.name || '', assistant.id || ''], [])
  )

  const [showSkeleton, setShowSkeleton] = useState(true)
  const loadingStartTime = useRef(Date.now())

  const isLoading = !builtInAssistants || builtInAssistants.length === 0

  useEffect(() => {
    if (isLoading) {
      loadingStartTime.current = Date.now()
      setShowSkeleton(true)
      return
    }
    const elapsed = Date.now() - loadingStartTime.current
    const minDuration = 300
    const remaining = minDuration - elapsed
    if (remaining <= 0) {
      setShowSkeleton(false)
      return
    }
    const timer = setTimeout(() => setShowSkeleton(false), remaining)
    return () => clearTimeout(timer)
  }, [isLoading])

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
            {showSkeleton ? (
              <GridSkeleton />
            ) : (
              <AssistantsTabContent assistants={filteredAssistants} onAssistantPress={handleAssistantItemPress} />
            )}
          </Container>
        </View>
      </DrawerGestureWrapper>
    </SafeAreaContainer>
  )
}
