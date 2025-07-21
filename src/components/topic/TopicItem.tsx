import AsyncStorage from '@react-native-async-storage/async-storage'
import { Trash2 } from '@tamagui/lucide-icons'
import { MotiView } from 'moti'
import { FC, useEffect, useRef, useState } from 'react' // CHANGED: Imported useMemo
import React from 'react'
import { RectButton } from 'react-native-gesture-handler'
import ReanimatedSwipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable'
import { interpolate, SharedValue, useAnimatedStyle } from 'react-native-reanimated'
import { Text, XStack } from 'tamagui'

import { useNavigation } from '@/hooks/useNavigation'
import { getCurrentTopicId } from '@/hooks/useTopic'
import i18n from '@/i18n'
import { getDefaultAssistant } from '@/services/AssistantService'
import { loggerService } from '@/services/LoggerService'
import { createNewTopic, deleteTopicById, getNewestTopic } from '@/services/TopicService'
import { Topic } from '@/types/assistant'
import { useIsDark } from '@/utils'
const logger = loggerService.withContext('Topic Item')

type TimeFormat = 'time' | 'date'

interface TopicItemProps {
  topic: Topic
  timeFormat?: TimeFormat
}

interface RenderRightActionsProps {
  progress: SharedValue<number>
  topic: Topic
  swipeableRef: React.RefObject<SwipeableMethods | null>
}

const RenderRightActions: FC<RenderRightActionsProps> = ({ progress, topic, swipeableRef }) => {
  const { navigateToChatScreen } = useNavigation()
  const animatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(progress.value, [0, 1], [50, 0])

    return {
      transform: [{ translateX }]
    }
  })

  const handleDelete = async () => {
    try {
      swipeableRef.current?.close()
      const deletedTopicId = topic.id
      await deleteTopicById(deletedTopicId)

      // 只在删除的是当前活动 topic 时才处理导航
      if (deletedTopicId === getCurrentTopicId()) {
        const nextTopic = await getNewestTopic()

        if (nextTopic) {
          // 如果还有其他 topic，直接跳转到最新的那一个
          navigateToChatScreen(nextTopic.id)
          logger.info('navigateToChatScreen after delete', nextTopic)
        } else {
          logger.info('No topics left, creating a new one.')
          const defaultAssistant = await getDefaultAssistant()
          const newTopic = await createNewTopic(defaultAssistant)
          navigateToChatScreen(newTopic.id)
          logger.info('navigateToChatScreen with new topic', newTopic)
        }
      }
    } catch (error) {
      logger.error('Delete Topic error', error)
    }
  }

  return (
    <MotiView style={[{ width: 80 }, animatedStyle]}>
      <RectButton
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onPress={handleDelete}>
        <Trash2 color="$textDelete" size={20} />
      </RectButton>
    </MotiView>
  )
}

const TopicItem: FC<TopicItemProps> = ({ topic, timeFormat = 'time' }) => {
  const isDark = useIsDark()
  const [currentLanguage, setCurrentLanguage] = useState<string>(i18n.language)
  const swipeableRef = useRef<SwipeableMethods>(null)
  const { navigateToChatScreen } = useNavigation()

  const renderRightActions = (progress: SharedValue<number>, _: SharedValue<number>) => {
    return <RenderRightActions progress={progress} topic={topic} swipeableRef={swipeableRef} />
  }

  const openTopic = () => {
    navigateToChatScreen(topic.id)
  }

  const date = new Date(topic.updatedAt)
  const displayTime =
    timeFormat === 'date'
      ? date.toLocaleDateString(currentLanguage, {
          month: 'short',
          day: 'numeric'
        })
      : date.toLocaleTimeString(currentLanguage, {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })

  useEffect(() => {
    const fetchCurrentLanguage = async () => {
      const storedLanguage = await AsyncStorage.getItem('language')

      if (storedLanguage) {
        setCurrentLanguage(storedLanguage)
      }
    }

    fetchCurrentLanguage()
  }, [])

  return (
    <ReanimatedSwipeable ref={swipeableRef} renderRightActions={renderRightActions} friction={1} rightThreshold={40}>
      <XStack
        borderRadius={30}
        backgroundColor={isDark ? '$uiCardDark' : '$uiCardLight'}
        justifyContent="space-between"
        alignItems="center"
        paddingVertical={15}
        paddingHorizontal={20}
        onPress={openTopic}>
        <Text fontSize={16} numberOfLines={1} ellipsizeMode="tail" fontWeight="500" maxWidth="80%">
          {topic.name}
        </Text>
        <Text fontSize={12} color="$gray10">
          {displayTime}
        </Text>
      </XStack>
    </ReanimatedSwipeable>
  )
}

export default TopicItem
