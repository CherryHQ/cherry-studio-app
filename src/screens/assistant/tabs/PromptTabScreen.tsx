import type { RouteProp } from '@react-navigation/native'
import { useRoute } from '@react-navigation/native'
import React from 'react'
import { ActivityIndicator } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'

import { SafeAreaContainer, YStack } from '@/componentsV2'
import { PromptTabContent } from '@/componentsV2/features/Assistant/PromptTabContent'
import { useAssistant } from '@/hooks/useAssistant'
import { useTheme } from '@/hooks/useTheme'
import type { AssistantDetailTabParamList } from '@/navigators/AssistantDetailTabNavigator'

type PromptTabRouteProp = RouteProp<AssistantDetailTabParamList, 'PromptTab'>

export default function PromptTabScreen() {
  const route = useRoute<PromptTabRouteProp>()
  const { isDark } = useTheme()
  const { assistant: _assistant } = route.params
  const { assistant, updateAssistant } = useAssistant(_assistant.id)

  if (!assistant) {
    return (
      <SafeAreaContainer className="flex-1  items-center justify-center">
        <ActivityIndicator />
      </SafeAreaContainer>
    )
  }

  return (
    <KeyboardAwareScrollView
      className={`flex-1 ${isDark ? 'bg-[#121213ff]' : 'bg-[#f7f7f7ff]'}`}
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bottomOffset={10}>
      <YStack className="flex-1 bg-transparent pt-2.5">
        <PromptTabContent assistant={assistant} updateAssistant={updateAssistant} />
      </YStack>
    </KeyboardAwareScrollView>
  )
}
