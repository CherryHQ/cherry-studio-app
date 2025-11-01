import type { RouteProp } from '@react-navigation/native'
import { useRoute } from '@react-navigation/native'
import { useTheme } from 'heroui-native'
import React from 'react'
import { ActivityIndicator } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'

import { SafeAreaContainer, YStack } from '@/componentsV2'
import { ModelTabContent } from '@/componentsV2/features/Assistant/ModelTabContent'
import { useAssistant } from '@/hooks/useAssistant'
import type { AssistantDetailTabParamList } from '@/navigators/AssistantDetailTabNavigator'

type ModelTabRouteProp = RouteProp<AssistantDetailTabParamList, 'ModelTab'>

export default function ModelTabScreen() {
  const route = useRoute<ModelTabRouteProp>()
  const { isDark } = useTheme()
  const { assistant: _assistant } = route.params
  const { assistant, updateAssistant } = useAssistant(_assistant.id)

  if (!assistant) {
    return (
      <SafeAreaContainer className="items-center justify-center">
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
      <YStack className="flex-1 px-2 pt-2.5">
        <ModelTabContent assistant={assistant} updateAssistant={updateAssistant} />
      </YStack>
    </KeyboardAwareScrollView>
  )
}
