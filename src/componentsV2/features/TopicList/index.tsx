import { FlashList } from '@shopify/flash-list'
import React, { useEffect, useMemo, useState } from 'react' // 引入 useMemo
import { useTranslation } from 'react-i18next'
import { TouchableOpacity } from 'react-native'

import Text from '@/componentsV2/base/Text'
import { ChevronDown, ChevronRight } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useDialog } from '@/hooks/useDialog'
import { useToast } from '@/hooks/useToast'
import { useCurrentTopic } from '@/hooks/useTopic'
import { getDefaultAssistant } from '@/services/AssistantService'
import { loggerService } from '@/services/LoggerService'
import { deleteMessagesByTopicId } from '@/services/MessagesService'
import { topicService } from '@/services/TopicService'
import type { Topic } from '@/types/assistant'
import type { DateGroupKey, TimeFormat } from '@/utils/date'
import { getTimeFormatForGroup, groupItemsByDate } from '@/utils/date'

import { TopicItem } from '../TopicItem'

const logger = loggerService.withContext('GroupTopicList')

interface GroupedTopicListProps {
  topics: Topic[]
  enableScroll: boolean
  handleNavigateChatScreen?: (topicId: string) => void
}

// ListItem 类型定义现在使用导入的 TimeFormat
type ListItem =
  | { type: 'header'; title: string; groupKey: DateGroupKey }
  | { type: 'topic'; topic: Topic; timeFormat: TimeFormat; groupKey: DateGroupKey }

export function TopicList({ topics, enableScroll, handleNavigateChatScreen }: GroupedTopicListProps) {
  const { t } = useTranslation()
  const [localTopics, setLocalTopics] = useState<Topic[]>([])
  const { currentTopicId, switchTopic } = useCurrentTopic()
  const toast = useToast()
  const dialog = useDialog()

  // 折叠状态管理 - 默认全部展开
  const [collapsedGroups, setCollapsedGroups] = useState<Record<DateGroupKey, boolean>>({
    today: false,
    yesterday: false,
    thisWeek: false,
    lastWeek: false,
    lastMonth: false,
    older: false
  })

  useEffect(() => {
    setLocalTopics(topics)
  }, [topics])

  // 切换分组折叠状态
  const toggleGroupCollapse = (groupKey: DateGroupKey) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }))
  }

  const listData = useMemo(() => {
    const groupedTopics = groupItemsByDate(topics, topic => new Date(topic.updatedAt))

    const groupOrder: DateGroupKey[] = ['today', 'yesterday', 'thisWeek', 'lastWeek', 'lastMonth', 'older']
    const groupTitles: Record<DateGroupKey, string> = {
      today: t('common.today'),
      yesterday: t('common.yesterday'),
      thisWeek: t('common.this_week'),
      lastWeek: t('common.last_week'),
      lastMonth: t('common.last_month'),
      older: t('common.older')
    }

    const data: ListItem[] = []

    groupOrder.forEach(key => {
      const topicList = groupedTopics[key]

      if (topicList.length > 0) {
        // 添加分组标题
        data.push({ type: 'header', title: groupTitles[key], groupKey: key })

        // 只有在分组未折叠时才添加话题
        if (!collapsedGroups[key]) {
          const format = getTimeFormatForGroup(key)

          topicList.forEach(topic => {
            data.push({ type: 'topic', topic, timeFormat: format, groupKey: key })
          })
        }
      }
    })

    return data
  }, [topics, t, collapsedGroups])

  const handleDelete = async (topicId: string) => {
    dialog.open({
      type: 'error',
      title: t('message.delete_topic'),
      content: t('message.delete_topic_confirmation'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      onConFirm: async () => {
        try {
          // Optimistically update local state
          const updatedTopics = localTopics.filter(topic => topic.id !== topicId)
          setLocalTopics(updatedTopics)

          // Delete messages associated with the topic
          await deleteMessagesByTopicId(topicId)

          // Delete topic (optimistic - handled by TopicService)
          await topicService.deleteTopic(topicId)

          toast.show(t('message.topic_deleted'))

          // If deleted topic was current, switch to next or create new
          if (topicId === currentTopicId) {
            const nextTopic =
              updatedTopics.length > 0
                ? updatedTopics.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
                : null

            if (nextTopic) {
              await switchTopic(nextTopic.id)
              handleNavigateChatScreen?.(nextTopic.id)
              logger.info('Switched to next topic after delete', nextTopic)
            } else {
              const defaultAssistant = await getDefaultAssistant()
              const newTopic = await topicService.createTopic(defaultAssistant)
              await switchTopic(newTopic.id)
              handleNavigateChatScreen?.(newTopic.id)
              logger.info('Created new topic after deleting last topic', newTopic)
            }
          }
        } catch (error) {
          logger.error('Error deleting topic:', error)
          // Rollback local state on error
          setLocalTopics(topics)
          toast.show(t('message.error_deleting_topic'))
        }
      }
    })
  }

  const handleRename = async (topicId: string, newName: string) => {
    try {
      // Optimistically update local state
      const updatedTopics = localTopics.map(topic =>
        topic.id === topicId ? { ...topic, name: newName, updatedAt: Date.now() } : topic
      )
      setLocalTopics(updatedTopics)

      // Rename topic (optimistic - handled by TopicService)
      await topicService.renameTopic(topicId, newName)

      logger.info('Topic renamed successfully', topicId, newName)
    } catch (error) {
      logger.error('Error renaming topic:', error)
      // Rollback local state on error
      setLocalTopics(topics)
      toast.show(t('message.error_renaming_topic'))
      throw error
    }
  }

  const renderItem = ({ item, index }: { item: ListItem; index: number }) => {
    switch (item.type) {
      case 'header': {
        const isCollapsed = collapsedGroups[item.groupKey]
        return (
          <TouchableOpacity
            onPress={() => toggleGroupCollapse(item.groupKey)}
            activeOpacity={0.7}
            style={{ paddingTop: index !== 0 ? 20 : 0 }}>
            <XStack className="items-center gap-2">
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              <Text className="text-text-primary font-bold">{item.title}</Text>
            </XStack>
          </TouchableOpacity>
        )
      }
      case 'topic':
        return (
          <TopicItem
            topic={item.topic}
            timeFormat={item.timeFormat}
            onDelete={handleDelete}
            onRename={handleRename}
            currentTopicId={currentTopicId}
            switchTopic={switchTopic}
            handleNavigateChatScreen={handleNavigateChatScreen}
          />
        )
      default:
        return null
    }
  }

  return (
    <FlashList
      data={listData}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      scrollEnabled={enableScroll}
      keyExtractor={(item, index) => {
        if (item.type === 'header') {
          return `header-${item.title}-${index}`
        }

        return item.topic.id
      }}
      ItemSeparatorComponent={() => <YStack className="h-2.5" />}
      contentContainerStyle={{ paddingHorizontal: 20 }}
    />
  )
}
