import { useNavigation } from '@react-navigation/native'
import React, { useEffect } from 'react'
import { ActivityIndicator } from 'react-native'

import SafeAreaContainer from '@/components/ui/SafeAreaContainer'
import { getDefaultAssistant } from '@/services/AssistantService'
import { loggerService } from '@/services/LoggerService'
import { createNewTopic, getNewestTopic } from '@/services/TopicService'
import { NavigationProps } from '@/types/naviagate'
import { runAsyncFunction } from '@/utils'

const logger = loggerService.withContext('HomeScreen')

const HomeScreen = () => {
  const navigation = useNavigation<NavigationProps>()

  useEffect(() => {
    runAsyncFunction(async () => {
      try {
        const newestTopic = await getNewestTopic()

        if (newestTopic) {
          // 使用 replace 避免用户可以返回到这个加载屏
          navigation.replace('ChatScreen', { topicId: newestTopic.id })
        } else {
          const defaultAssistant = await getDefaultAssistant()
          const newTopic = await createNewTopic(defaultAssistant)
          navigation.replace('ChatScreen', { topicId: newTopic.id })
        }
      } catch (error) {
        logger.error('Get Newest Topic on Home Screen', error)
      }
    })
  }, [navigation])

  return (
    <SafeAreaContainer style={{ alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator />
    </SafeAreaContainer>
  )
}

export default HomeScreen
