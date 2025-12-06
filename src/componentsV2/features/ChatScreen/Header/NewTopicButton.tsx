import { useNavigation } from '@react-navigation/native'
import React from 'react'
import { Pressable } from 'react-native'

import { MessageSquareDiff } from '@/componentsV2/icons/LucideIcon'
import { useCreateNewTopic } from '@/hooks/useCreateNewTopic'
import type { Assistant } from '@/types/assistant'
import type { DrawerNavigationProps } from '@/types/naviagate'

interface NewTopicButtonProps {
  assistant: Assistant
}

export const NewTopicButton: React.FC<NewTopicButtonProps> = ({ assistant }) => {
  const navigation = useNavigation<DrawerNavigationProps>()
  const { createNewTopic } = useCreateNewTopic()

  const handleAddNewTopic = async () => {
    const topicId = await createNewTopic(assistant)
    navigation.navigate('Home', { screen: 'ChatScreen', params: { topicId } })
  }

  return (
    <Pressable onPress={handleAddNewTopic} className="active:opacity-20">
      <MessageSquareDiff size={24} />
    </Pressable>
  )
}
