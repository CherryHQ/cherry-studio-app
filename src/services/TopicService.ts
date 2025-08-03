import { takeRight } from 'lodash'
import { t } from 'i18next'

import ModernAiProvider from '@/aiCore/index_new'
import { AiSdkMiddlewareConfig } from '@/aiCore/middleware/aisdk/AiSdkMiddlewareBuilder'
import { buildStreamTextParams, convertMessagesToSdkMessages } from '@/aiCore/transformParameters'
import { getAssistantById, getAssistantProvider, getDefaultModel } from '@/services/AssistantService'
import { loggerService } from '@/services/LoggerService'
import { createStreamProcessor, StreamProcessorCallbacks } from '@/services/StreamProcessingService'
import { Assistant, Topic } from '@/types/assistant'
import { uuid } from '@/utils'
import { filterMainTextMessages } from '@/utils/messageUtils/filters'

import {
  deleteTopicById as _deleteTopicById,
  deleteTopicsByAssistantId as _deleteTopicsByAssistantId,
  getTopicById as _getTopicById,
  getTopics as _getTopics,
  getTopicsByAssistantId as _getTopicsByAssistantId,
  isTopicOwnedByAssistant as _isTopicOwnedByAssistant,
  upsertTopics as _upsertTopics
} from '../../db/queries/topics.queries'
const logger = loggerService.withContext('Topic Service')

export async function createNewTopic(assistant: Assistant): Promise<Topic> {
  const newTopic: Topic = {
    id: uuid(),
    assistantId: assistant.id,
    name: t('topics.new_topic'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: []
  }
  logger.info('createNewTopic', newTopic.id)
  await _upsertTopics(newTopic)
  return newTopic
}

export async function upsertTopics(topics: Topic[]): Promise<void> {
  const updatedTopics: Topic[] = topics.map(topic => ({
    ...topic,
    name: topic.name ? topic.name : t('new_topic'),
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
    assistantId: topic.assistantId
  }))
  await _upsertTopics(updatedTopics)
}

export async function getNewestTopic(): Promise<Topic | null> {
  const topics = await getTopics()

  if (topics.length === 0) {
    return null
  }

  return topics[0]
}

export async function deleteTopicById(topicId: string): Promise<void> {
  try {
    await _deleteTopicById(topicId)
  } catch (error) {
    logger.error('Failed to delete topic:', error)
    throw error
  }
}

export async function getTopicById(topicId: string): Promise<Topic | null> {
  try {
    const topic = await _getTopicById(topicId)

    if (!topic) {
      return null
    }

    return topic
  } catch (error) {
    logger.error('Failed to get topic by ID:', error)
    return null
  }
}

export async function getTopics(): Promise<Topic[]> {
  try {
    return await _getTopics()
  } catch (error) {
    logger.error('Failed to get topics', error)
    return []
  }
}

export async function getTopicsByAssistantId(assistantId: string): Promise<Topic[]> {
  try {
    return await _getTopicsByAssistantId(assistantId)
  } catch (error) {
    logger.error('Failed to get topics By AssistantId', assistantId, error)
    return []
  }
}

export async function isTopicOwnedByAssistant(assistantId: string, topicId: string): Promise<boolean> {
  try {
    return await _isTopicOwnedByAssistant(assistantId, topicId)
  } catch (error) {
    logger.error('Failed to get topics By AssistantId', assistantId, error)
    return false
  }
}

export async function deleteTopicsByAssistantId(assistantId: string): Promise<void> {
  try {
    await _deleteTopicsByAssistantId(assistantId)
  } catch (error) {
    logger.error('Failed to delete topic:', error)
    throw error
  }
}

export async function fetchTopicNaming(topicId: string) {
  logger.info('Fetching topic naming...')
  const topic = await getTopicById(topicId)

  if (!topic) {
    logger.error(`[fetchTopicNaming] Topic with ID ${topicId} not found.`)
    return
  }

  if (topic.name !== t('topics.new_topic')) {
    return
  }

  let callbacks: StreamProcessorCallbacks = {}

  callbacks = {
    onTextComplete: async finalText => {
      await upsertTopics([
        {
          ...topic,
          name: finalText
        }
      ])
    }
  }
  const streamProcessorCallbacks = createStreamProcessor(callbacks)
  const topicNamingAssistant = await getAssistantById('topic_naming')

  if (!topicNamingAssistant.model) {
    throw new Error('Translate assistant model is not defined')
  }

  const provider = await getAssistantProvider(topicNamingAssistant)

  // 总结上下文总是取最后5条消息
  const contextMessages = takeRight(topic.messages, 5)

  // LLM对多条消息的总结有问题，用单条结构化的消息表示会话内容会更好
  const mainTextMessages = await filterMainTextMessages(contextMessages)

  const llmMessages = await convertMessagesToSdkMessages(mainTextMessages, topicNamingAssistant.model)

  const AI = new ModernAiProvider(topicNamingAssistant.model || getDefaultModel(), provider)
  const { params: aiSdkParams, modelId } = await buildStreamTextParams(llmMessages, topicNamingAssistant, provider)

  const middlewareConfig: AiSdkMiddlewareConfig = {
    streamOutput: topicNamingAssistant.settings?.streamOutput ?? true,
    onChunk: streamProcessorCallbacks,
    model: topicNamingAssistant.model,
    provider: provider,
    enableReasoning: topicNamingAssistant.settings?.reasoning_effort !== undefined
  }

  try {
    return (await AI.completions(modelId, aiSdkParams, middlewareConfig)).getText() || ''
  } catch (error: any) {
    logger.error('Error during translation:', error)
    return ''
  }
}
