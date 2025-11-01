import type { DrawerNavigationProp } from '@react-navigation/drawer'
import type { ParamListBase } from '@react-navigation/native'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import React from 'react'

import { IconButton, XStack } from '@/componentsV2'
import { Menu } from '@/componentsV2/icons/LucideIcon'
import { useAssistant } from '@/hooks/useAssistant'
import type { Topic } from '@/types/assistant'

import { AssistantSelection } from './AssistantSelection'
import { NewTopicButton } from './NewTopicButton'

interface HeaderBarProps {
  topic: Topic
}

export const ChatScreenHeader = ({ topic }: HeaderBarProps) => {
  const navigation = useNavigation<DrawerNavigationProp<ParamListBase>>()
  const { assistant, isLoading } = useAssistant(topic.assistantId)

  const handleMenuPress = () => {
    navigation.dispatch(DrawerActions.openDrawer())
  }

  if (isLoading || !assistant) {
    return null
  }

  return (
    <XStack className="h-11 items-center justify-between px-3.5">
      <XStack className="min-w-10 items-center">
        <IconButton onPress={handleMenuPress} icon={<Menu size={24} />} />
      </XStack>
      <XStack className="flex-1 items-center justify-center">
        <AssistantSelection assistant={assistant} topic={topic} />
      </XStack>
      <XStack className="min-w-10 items-center justify-end">
        <NewTopicButton assistant={assistant} />
      </XStack>
    </XStack>
  )
}
