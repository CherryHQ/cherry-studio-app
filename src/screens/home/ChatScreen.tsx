import { RouteProp, useRoute } from '@react-navigation/native'
import React from 'react'
import { ActivityIndicator, Keyboard, Platform, TouchableWithoutFeedback } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { YStack } from 'tamagui'

import { HeaderBar } from '@/components/header-bar'
import { MessageInput } from '@/components/message-input/MessageInput'
import SafeAreaContainer from '@/components/ui/SafeAreaContainer'
import { useAssistant } from '@/hooks/useAssistant'
import { useTopic } from '@/hooks/useTopic'
import { loggerService } from '@/services/LoggerService'
import { RootStackParamList } from '@/types/naviagate'

import ChatContent from './ChatContent'
import WelcomeContent from './WelcomeContent'

const logger = loggerService.withContext('ChatScreen')
type ChatScreenRouteProp = RouteProp<RootStackParamList, 'ChatScreen'>

const ChatScreen = () => {
  const route = useRoute<ChatScreenRouteProp>()
  const { topicId } = route.params
  logger.info('topicId', topicId)
  const { updateAssistant } = useAssistant('default')
  const { topic, isLoading } = useTopic(topicId)

  if (!topic || isLoading) {
    return (
      <SafeAreaContainer style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </SafeAreaContainer>
    )
  }

  const hasMessages = topic.messages.length > 0

  return (
    <SafeAreaContainer>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <YStack paddingHorizontal={12} backgroundColor="$background" flex={1} onPress={Keyboard.dismiss} gap={20}>
            <HeaderBar topic={topic} />

            {hasMessages ? <ChatContent key={topic.id} topic={topic} /> : <WelcomeContent key={topic.id} />}
            <MessageInput topic={topic} updateAssistant={updateAssistant} />
          </YStack>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaContainer>
  )
}

export default ChatScreen
