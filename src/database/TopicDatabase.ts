import {
  deleteTopicById as _deleteTopicById,
  deleteTopicsByAssistantId as _deleteTopicsByAssistantId,
  getNewestTopic as _getNewestTopic,
  getTopicById as _getTopicById,
  getTopics as _getTopics,
  getTopicsByAssistantId as _getTopicsByAssistantId,
  isTopicOwnedByAssistant as _isTopicOwnedByAssistant,
  upsertTopics as _upsertTopics
} from '@db/queries/topics.queries'

import type { Topic } from '@/types/assistant'

export async function upsertTopics(topics: Topic | Topic[]) {
  return _upsertTopics(topics)
}

export async function deleteTopicById(topicId: string) {
  return _deleteTopicById(topicId)
}

export async function deleteTopicsByAssistantId(assistantId: string) {
  return _deleteTopicsByAssistantId(assistantId)
}

export async function getNewestTopic() {
  return _getNewestTopic()
}

export async function getTopicById(topicId: string) {
  return _getTopicById(topicId)
}

export async function getTopics() {
  return _getTopics()
}

export async function getTopicsByAssistantId(assistantId: string) {
  return _getTopicsByAssistantId(assistantId)
}

export async function isTopicOwnedByAssistant(assistantId: string, topicId: string) {
  return _isTopicOwnedByAssistant(assistantId, topicId)
}

export const topicDatabase = {
  upsertTopics,
  deleteTopicById,
  deleteTopicsByAssistantId,
  getNewestTopic,
  getTopicById,
  getTopics,
  getTopicsByAssistantId,
  isTopicOwnedByAssistant
}
