import { RouteProp, useRoute } from '@react-navigation/native'
import React from 'react'
import { ActivityIndicator } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'

import { YStack, SafeAreaContainer } from '@/componentsV2'
import { useAssistant } from '@/hooks/useAssistant'
import { useTheme } from 'heroui-native'
import { AssistantDetailTabParamList } from '@/navigators/AssistantDetailTabNavigator'
import { ToolTabContent } from '@/componentsV2/features/Assistant/ToolTabContent'

type ToolTabRouteProp = RouteProp<AssistantDetailTabParamList, 'ToolTab'>

export default function ToolTabScreen() {
  const route = useRoute<ToolTabRouteProp>()
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
        <ToolTabContent assistant={assistant} updateAssistant={updateAssistant} />
      </YStack>
    </KeyboardAwareScrollView>
  )
}
