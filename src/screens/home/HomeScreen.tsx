import { RouteProp, useRoute } from '@react-navigation/native'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform } from 'react-native'
import { styled, View, YStack } from 'tamagui'

import { HeaderBar } from '@/components/header-bar'
import { MessageInput } from '@/components/message-input/MessageInput'
import SafeAreaContainer from '@/components/ui/SafeAreaContainer'
import { useAssistant } from '@/hooks/useAssistant'
import { useTopic } from '@/hooks/useTopic'
import { getDefaultAssistant } from '@/services/AssistantService'
import { createNewTopic, getNewestTopic, getTopicById } from '@/services/TopicService'
import { Assistant, Topic } from '@/types/assistant'
import { RootStackParamList } from '@/types/naviagate'
import { runAsyncFunction } from '@/utils'

import ChatContent from './ChatContent'
import WelcomeContent from './WelcomeContent'

type HomeScreenRouteProp = RouteProp<RootStackParamList, 'HomeScreen'>

const HomeChat = ({ initialTopic }: { initialTopic: Topic }) => {
  const { updateAssistant } = useAssistant('default')
  const { topic, isLoading, updateTopic } = useTopic(initialTopic.id)

  const handleAssistantSelect = async (selectedAssistant: Assistant) => {
    runAsyncFunction(async () => {
      const newTopic = await createNewTopic(selectedAssistant)
      updateTopic(newTopic)
    })
  }

  if (!topic || isLoading) {
    return (
      <SafeAreaContainer>
        <ActivityIndicator />
      </SafeAreaContainer>
    )
  }

  const hasMessages = topic.messages.length > 0

  return (
    <SafeAreaContainer>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <YStack paddingHorizontal={12} backgroundColor="$background" flex={1} onPress={Keyboard.dismiss}>
          <HeaderBar topic={topic} />

          {hasMessages ? <ChatContent topic={topic} /> : <WelcomeContent onAssistantSelect={handleAssistantSelect} />}
          <InputContainer>
            <MessageInput topic={topic} updateAssistant={updateAssistant} />
          </InputContainer>
        </YStack>
      </KeyboardAvoidingView>
    </SafeAreaContainer>
  )
}

const HomeScreen = () => {
  const [topic, setTopic] = useState<Topic | null>(null)
  const route = useRoute<HomeScreenRouteProp>()
  const { topicId } = route.params || {}

  useEffect(() => {
    const loadData = async () => {
      const defaultAssistant = await getDefaultAssistant()
      let currentTopic: Topic | null = null

      if (topicId) {
        currentTopic = await getTopicById(topicId)

        if (!currentTopic) {
          console.warn(`Topic with ID ${topicId} not found.`)
          currentTopic = await createNewTopic(defaultAssistant)
        }
      } else {
        currentTopic = await getNewestTopic()

        if (!currentTopic) {
          currentTopic = await createNewTopic(defaultAssistant)
        }
      }

      setTopic(currentTopic)
    }

    runAsyncFunction(loadData)
  }, [topicId])

  if (!topic) {
    return (
      <SafeAreaContainer>
        <ActivityIndicator />
      </SafeAreaContainer>
    )
  }

  return <HomeChat key={topic.id} initialTopic={topic} />
}

const InputContainer = styled(View, {
  paddingHorizontal: 16,
  paddingVertical: 12,
  backgroundColor: '$gray2',
  borderRadius: 12
})

export default HomeScreen
