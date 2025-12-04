import { useNavigation } from '@react-navigation/native'
import React from 'react'
import { Keyboard, Pressable } from 'react-native'

import { Text, XStack, YStack } from '@/componentsV2'
import { ChevronRight } from '@/componentsV2/icons'
import type { Assistant, Topic } from '@/types/assistant'
import type { HomeNavigationProps } from '@/types/naviagate'

interface AssistantSelectionProps {
  assistant: Assistant
  topic: Topic
}

export const AssistantSelection: React.FC<AssistantSelectionProps> = ({ assistant, topic }) => {
  const navigation = useNavigation<HomeNavigationProps>()

  const handlePress = () => {
    Keyboard.dismiss()
    navigation.navigate('AssistantDetailScreen', {
      assistantId: assistant.id,
      returnTo: 'chat',
      topicId: topic.id,
      tab: 'model'
    })
  }

  return (
    <Pressable onPress={handlePress} className="active:opacity-60">
      <XStack className="items-center justify-center">
        <YStack className="items-center justify-start gap-0.5">
          <XStack className="items-center justify-start gap-0.5">
            <Text className="text-foreground text-base" ellipsizeMode="tail" numberOfLines={1}>
              {assistant.name}
            </Text>
            <ChevronRight className="text-foreground-secondary" size={20} />
          </XStack>
          <Text className="text-[11px] text-zinc-400/60" ellipsizeMode="tail" numberOfLines={1}>
            {topic.name}
          </Text>
        </YStack>
      </XStack>
    </Pressable>
  )
}
