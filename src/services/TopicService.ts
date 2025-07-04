import { t } from 'i18next'

import { Assistant, Topic } from '@/types/assistant'
import { Message } from '@/types/message'
import { uuid } from '@/utils'

import {
  deleteTopicById as _deleteTopicById,
  getTopicById as _getTopicById,
  getTopics,
  upsertTopics
} from '../../db/queries/topics.queries'

export async function createNewTopic(assistant: Assistant): Promise<Topic> {
  const newTopic: Topic = {
    id: uuid(),
    assistantId: assistant.id,
    name: t('new_topic'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: []
  }
  await upsertTopics(newTopic)
  return newTopic
}

export async function updateTopics(topics: { id: string; messages: Message[] }[]): Promise<void> {
  const updatedTopics: Topic[] = topics.map(topic => ({
    ...topic,
    name: t('new_topic'),
    createdAt: topic.messages.at(0)?.createdAt || new Date().toISOString(),
    updatedAt: topic.messages.at(-1)?.createdAt || new Date().toISOString(),
    assistantId: topic.messages.at(-1)?.assistantId || ''
  }))
  await upsertTopics(updatedTopics)
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
    console.error('Failed to delete topic:', error)
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
    console.error('Failed to get topic by ID:', error)
    return null
  }
}
