import type { RouteProp } from '@react-navigation/native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { SymbolView } from 'expo-symbols'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { HeaderBar, ListSkeleton, SafeAreaContainer, SearchInput, TopicList, XStack, YStack } from '@/componentsV2'
import { LiquidGlassButton } from '@/componentsV2/base/LiquidGlassButton'
import Text from '@/componentsV2/base/Text'
import { MessageSquareDiff, Trash2 } from '@/componentsV2/icons/LucideIcon'
import { useDialog } from '@/hooks/useDialog'
import { useSearch } from '@/hooks/useSearch'
import { useToast } from '@/hooks/useToast'
import { useCurrentTopic, useTopics } from '@/hooks/useTopic'
import type { HomeStackParamList } from '@/navigators/HomeStackNavigator'
import { assistantService, getDefaultAssistant } from '@/services/AssistantService'
import { loggerService } from '@/services/LoggerService'
import { deleteMessagesByTopicId } from '@/services/MessagesService'
import { topicService } from '@/services/TopicService'
import type { DrawerNavigationProps } from '@/types/naviagate'
import { isIOS } from '@/utils/device'

const logger = loggerService.withContext('TopicScreen')

export default function TopicScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<DrawerNavigationProps>()
  const route = useRoute<RouteProp<HomeStackParamList, 'TopicScreen'>>()
  const assistantId = route.params?.assistantId
  const { topics, isLoading } = useTopics()
  const { currentTopicId, switchTopic } = useCurrentTopic()
  const toast = useToast()
  const dialog = useDialog()
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false)
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([])
  const [isDeleting, setIsDeleting] = useState(false)
  const [showSkeleton, setShowSkeleton] = useState(true)
  const loadingStartTime = useRef(Date.now())

  const assistantTopics = useMemo(() => {
    if (!assistantId) {
      return topics
    }
    return topics.filter(topic => topic.assistantId === assistantId)
  }, [assistantId, topics])

  const {
    searchText,
    setSearchText,
    filteredItems: filteredTopics
  } = useSearch(
    assistantTopics,
    useCallback(topic => [topic.name], []),
    { delay: 100 }
  )

  const selectionCount = selectedTopicIds.length
  const hasSelection = selectionCount > 0

  const getAssistantForNewTopic = useCallback(async () => {
    if (assistantId) {
      const assistant = await assistantService.getAssistant(assistantId)
      if (assistant) {
        return assistant
      }
    }
    return await getDefaultAssistant()
  }, [assistantId])

  useEffect(() => {
    if (isLoading) {
      loadingStartTime.current = Date.now()
      setShowSkeleton(true)
      return
    }
    const elapsed = Date.now() - loadingStartTime.current
    const minDuration = 300
    const remaining = minDuration - elapsed
    if (remaining <= 0) {
      setShowSkeleton(false)
      return
    }
    const timer = setTimeout(() => setShowSkeleton(false), remaining)
    return () => clearTimeout(timer)
  }, [isLoading])

  const handleAddNewTopic = async () => {
    const targetAssistant = await getAssistantForNewTopic()
    const newTopic = await topicService.createTopic(targetAssistant)
    navigation.navigate('Home', { screen: 'ChatScreen', params: { topicId: newTopic.id } })
  }

  const handleEnterMultiSelectMode = useCallback((topicId: string) => {
    setIsMultiSelectMode(true)
    setSelectedTopicIds(prev => {
      if (prev.includes(topicId)) {
        return prev
      }
      return [...prev, topicId]
    })
  }, [])

  const handleToggleTopicSelection = useCallback(
    (topicId: string) => {
      if (!isMultiSelectMode) return
      setSelectedTopicIds(prev => {
        if (prev.includes(topicId)) {
          return prev.filter(id => id !== topicId)
        }
        return [...prev, topicId]
      })
    },
    [isMultiSelectMode]
  )

  const handleCancelMultiSelect = useCallback(() => {
    setIsMultiSelectMode(false)
    setSelectedTopicIds([])
  }, [])

  const performBatchDelete = useCallback(async () => {
    if (!selectedTopicIds.length) return
    setIsDeleting(true)
    const idsToDelete = [...selectedTopicIds]
    const selectionSet = new Set(idsToDelete)

    try {
      const remainingTopics = topics
        .filter(topic => !selectionSet.has(topic.id))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

      for (const topicId of idsToDelete) {
        await deleteMessagesByTopicId(topicId)
        await topicService.deleteTopic(topicId)
      }

      if (selectionSet.has(currentTopicId)) {
        const nextTopic = remainingTopics.length > 0 ? remainingTopics[0] : null

        if (nextTopic) {
          await switchTopic(nextTopic.id)
        } else {
          const targetAssistant = await getAssistantForNewTopic()
          const newTopic = await topicService.createTopic(targetAssistant)
          await switchTopic(newTopic.id)
        }
      }

      toast.show(t('topics.multi_select.delete_success', { count: idsToDelete.length }))
      handleCancelMultiSelect()
    } catch (error) {
      logger.error('Error deleting topics:', error)
      toast.show(t('message.error_deleting_topic'))
    } finally {
      setIsDeleting(false)
    }
  }, [
    currentTopicId,
    getAssistantForNewTopic,
    handleCancelMultiSelect,
    selectedTopicIds,
    switchTopic,
    t,
    toast,
    topics
  ])

  const handleBatchDelete = useCallback(() => {
    if (!hasSelection || isDeleting) return
    dialog.open({
      type: 'error',
      title: t('topics.multi_select.delete_confirm_title', { count: selectionCount }),
      content: t('topics.multi_select.delete_confirm_message', { count: selectionCount }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      onConFirm: () => {
        void performBatchDelete()
      }
    })
  }, [dialog, hasSelection, isDeleting, performBatchDelete, selectionCount, t])

  return (
    <SafeAreaContainer className="flex-1">
      <View collapsable={false} className="flex-1">
        {isMultiSelectMode ? (
          <HeaderBar
            title={t('topics.multi_select.selected_count', { count: selectionCount })}
            showBackButton={false}
            rightButton={{
              icon: <Text className="text-base font-medium">{t('common.cancel')}</Text>,
              onPress: handleCancelMultiSelect
            }}
          />
        ) : (
          <HeaderBar
            title={t('topics.title.recent')}
            rightButton={{
              icon: <MessageSquareDiff size={24} />,
              onPress: handleAddNewTopic
            }}
          />
        )}
        <YStack className="flex-1 gap-[15px]">
          <View className="px-5">
            <SearchInput placeholder={t('common.search_placeholder')} value={searchText} onChangeText={setSearchText} />
          </View>
          <View className="flex-1">
            {showSkeleton ? (
              <ListSkeleton />
            ) : (
              <TopicList
                topics={filteredTopics}
                enableScroll={true}
                isMultiSelectMode={isMultiSelectMode}
                selectedTopicIds={selectedTopicIds}
                onToggleTopicSelection={handleToggleTopicSelection}
                onEnterMultiSelectMode={handleEnterMultiSelectMode}
                getAssistantForNewTopic={getAssistantForNewTopic}
              />
            )}
          </View>
        </YStack>
        {isMultiSelectMode && (
          <View className="absolute bottom-0 left-0 right-0 px-5">
            <XStack className="items-center justify-end gap-2">
              <LiquidGlassButton size={40} onPress={handleBatchDelete}>
                {isIOS ? <SymbolView name="trash" size={20} tintColor={'red'} /> : <Trash2 size={20} color="red" />}
              </LiquidGlassButton>
            </XStack>
          </View>
        )}
      </View>
    </SafeAreaContainer>
  )
}
