import { messageDatabase } from '@database'
import { useCallback } from 'react'

import { topicService } from '@/services/TopicService'
import type { Topic } from '@/types/assistant'
import { abortCompletion } from '@/utils/abortController'

import { useTopic } from './useTopic'

/**
 * Hook 提供针对特定主题的消息操作方法。 / Hook providing various operations for messages within a specific topic.
 * @param topic 当前主题对象。 / The current topic object.
 * @returns 包含消息操作函数的对象。 / An object containing message operation functions.
 */
export function useMessageOperations(topic: Topic) {
  /**
   * todo: 暂停当前主题正在进行的消息生成。 / Pauses ongoing message generation for the current topic.
   */
  const pauseMessages = useCallback(async () => {
    const topicMessages = await messageDatabase.getMessagesByTopicId(topic.id)
    if (!topicMessages) return

    const streamingMessages = topicMessages.filter(m => m.status === 'processing' || m.status === 'pending')
    const askIds = [...new Set(streamingMessages?.map(m => m.askId).filter(id => !!id) as string[])]

    for (const askId of askIds) {
      abortCompletion(askId)
    }

    await topicService.updateTopic(topic.id, { isLoading: false })
  }, [topic])

  return {
    pauseMessages
  }
}

export const useTopicLoading = (topicId: string) => {
  const { topic, isLoading: isTopicQueryLoading } = useTopic(topicId)

  // 如果 topic 查询还在加载中，返回 false 作为默认值
  if (isTopicQueryLoading || !topic) {
    return false
  }

  return topic.isLoading || false
}
