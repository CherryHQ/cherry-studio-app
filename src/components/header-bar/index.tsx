import { DrawerNavigationProp } from '@react-navigation/drawer'
import { DrawerActions, ParamListBase, useNavigation } from '@react-navigation/native'
import React from 'react'
import { XStack } from 'tamagui'

import { useAssistant } from '@/hooks/useAssistant'
import { Topic } from '@/types/assistant'

import { AssistantSelection } from './AssistantSelection'
import { MenuButton } from './MenuButton'
import { NewTopicButton } from './NewTopicButton'

interface HeaderBarProps {
  topic: Topic
}

export const HeaderBar = ({ topic }: HeaderBarProps) => {
  const navigation = useNavigation<DrawerNavigationProp<ParamListBase>>()
  const { assistant, isLoading } = useAssistant(topic.assistantId)

  const handleMenuPress = () => {
    navigation.dispatch(DrawerActions.openDrawer())
  }

  if (isLoading || !assistant) {
    return null
  }

  return (
    <>
      <XStack paddingHorizontal="$4" alignItems="center" height={44} justifyContent="space-between">
        <XStack alignItems="center" minWidth={40}>
          <MenuButton onMenuPress={handleMenuPress} />
        </XStack>
        <XStack flex={1} justifyContent="center" alignItems="center">
          <AssistantSelection assistantId={assistant.id} />
        </XStack>
        <XStack alignItems="center" minWidth={40} justifyContent="flex-end">
          <NewTopicButton assistant={assistant} />
        </XStack>
      </XStack>
    </>
  )
}
