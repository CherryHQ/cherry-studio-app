import {
  deleteMessageById as _deleteMessageById,
  deleteMessagesByTopicId as _deleteMessagesByTopicId,
  getAllMessages as _getAllMessages,
  getHasMessagesWithTopicId as _getHasMessagesWithTopicId,
  getMessageById as _getMessageById,
  getMessagesByTopicId as _getMessagesByTopicId,
  removeAllMessages as _removeAllMessages,
  updateMessageById as _updateMessageById,
  upsertMessages as _upsertMessages
} from '@db/queries/messages.queries'

import type { Message } from '@/types/message'

export async function upsertMessages(messages: Message | Message[]) {
  return _upsertMessages(messages)
}

export async function deleteMessagesByTopicId(topicId: string) {
  return _deleteMessagesByTopicId(topicId)
}

export async function deleteMessageById(messageId: string) {
  return _deleteMessageById(messageId)
}

export async function removeAllMessages() {
  return _removeAllMessages()
}

export async function updateMessageById(messageId: string, updates: Partial<Message>) {
  return _updateMessageById(messageId, updates)
}

export async function getMessageById(messageId: string) {
  return _getMessageById(messageId)
}

export async function getMessagesByTopicId(topicId: string) {
  return _getMessagesByTopicId(topicId)
}

export async function getHasMessagesWithTopicId(topicId: string) {
  return _getHasMessagesWithTopicId(topicId)
}

export async function getAllMessages() {
  return _getAllMessages()
}

export const messageDatabase = {
  upsertMessages,
  deleteMessagesByTopicId,
  deleteMessageById,
  removeAllMessages,
  updateMessageById,
  getMessageById,
  getMessagesByTopicId,
  getHasMessagesWithTopicId,
  getAllMessages
}
