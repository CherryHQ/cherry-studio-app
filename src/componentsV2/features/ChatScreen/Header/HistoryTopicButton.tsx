import { useNavigation } from '@react-navigation/native'
import React, { useCallback } from 'react'

import { IconButton } from '@/componentsV2'
import { Clock } from '@/componentsV2/icons/LucideIcon'
import type { Assistant } from '@/types/assistant'
import type { DrawerNavigationProps } from '@/types/naviagate'

interface HistoryTopicButtonProps {
  assistant: Assistant
}

export const HistoryTopicButton: React.FC<HistoryTopicButtonProps> = ({ assistant }) => {
  const navigation = useNavigation<DrawerNavigationProps>()

  const handlePress = useCallback(() => {
    navigation.navigate('Home', {
      screen: 'TopicScreen',
      params: {
        assistantId: assistant.id
      }
    })
  }, [assistant.id, navigation])

  return <IconButton icon={<Clock size={24} />} onPress={handlePress} />
}

