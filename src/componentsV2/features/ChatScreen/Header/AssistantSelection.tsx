import { useNavigation } from '@react-navigation/native'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, Pressable } from 'react-native'

import { Text, XStack, YStack } from '@/componentsV2'
import {
  dismissAssistantItemSheet,
  presentAssistantItemSheet
} from '@/componentsV2/features/Assistant/AssistantItemSheet'
import { ChevronRight } from '@/componentsV2/icons'
import type { Assistant, Topic } from '@/types/assistant'
import type { DrawerNavigationProps } from '@/types/naviagate'

interface AssistantSelectionProps {
  assistant: Assistant
  topic: Topic
}

export const AssistantSelection: React.FC<AssistantSelectionProps> = ({ assistant, topic }) => {
  const navigation = useNavigation<DrawerNavigationProps>()
  const { t } = useTranslation()

  const handleEditAssistant = (assistantId: string) => {
    navigation.navigate('Assistant', { screen: 'AssistantDetailScreen', params: { assistantId } })
  }

  const handlePressActionButton = () => {
    dismissAssistantItemSheet()
    navigation.navigate('Assistant', { screen: 'AssistantScreen' })
  }

  const handlePress = () => {
    Keyboard.dismiss()
    presentAssistantItemSheet({
      assistant,
      source: 'external',
      onEdit: handleEditAssistant,
      actionButton: {
        text: t('assistants.title.change'),
        onPress: handlePressActionButton
      }
    })
  }

  return (
    <Pressable onPress={handlePress} className="active:opacity-60">
      <XStack className="items-center justify-center">
        <YStack className="items-center justify-start gap-0.5">
          <XStack className="items-center justify-start gap-0.5">
            <Text className="text-text-primary text-base" ellipsizeMode="tail" numberOfLines={1}>
              {assistant.name}
            </Text>
            <ChevronRight className="text-text-secondary" size={20} />
          </XStack>
          <Text className="text-gray-60 text-[11px]" ellipsizeMode="tail" numberOfLines={1}>
            {topic.name}
          </Text>
        </YStack>
      </XStack>
    </Pressable>
  )
}
