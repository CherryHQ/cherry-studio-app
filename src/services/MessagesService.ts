import { throttle } from 'lodash'
import { LRUCache } from 'lru-cache'

import { loggerService } from '@/services/LoggerService'
import { Assistant, Model, Topic, Usage } from '@/types/assistant'
import { FileType, FileTypes } from '@/types/file'
import { AssistantMessageStatus, Message, MessageBlock, MessageBlockStatus } from '@/types/message'
import { uuid } from '@/utils'
import {
  createAssistantMessage,
  createFileBlock,
  createImageBlock,
  createMainTextBlock,
  createMessage,
  resetAssistantMessage
} from '@/utils/messageUtils/create'
import { getTopicQueue } from '@/utils/queue'

import { getBlockById, removeManyBlocks, updateOneBlock, upsertBlocks } from '../../db/queries/messageBlocks.queries'
import {
  getMessageById,
  getMessagesByTopicId,
  updateMessageById,
  upsertMessages
} from '../../db/queries/messages.queries'
import { getTopicById, updateTopicMessages } from '../../db/queries/topics.queries'
import { getDefaultModel } from './AssistantService'
import { BlockManager, createCallbacks } from './messageStreaming'
import { OrchestrationService } from './OrchestrationService'
import { createStreamProcessor, StreamProcessorCallbacks } from './StreamProcessingService'

const logger = loggerService.withContext('Messages Service')

/**
 * Creates a user message object and associated blocks based on input.
 * This is a pure function and does not dispatch to the store.
 *
 * @param params - The parameters for creating the message.
 * @returns An object containing the created message and its blocks.
 */
export function getUserMessage({
  assistant,
  topic,
  type,
  content,
  files,
  // Keep other potential params if needed by createMessage
  mentions,
  usage
}: {
  assistant: Assistant
  topic: Topic
  type?: Message['type']
  content?: string
  files?: FileType[]
  mentions?: Model[]
  usage?: Usage
}): { message: Message; blocks: MessageBlock[] } {
  const defaultModel = getDefaultModel()
  const model = assistant.model || defaultModel
  const messageId = uuid() // Generate ID here
  const blocks: MessageBlock[] = []
  const blockIds: string[] = []

  if (files?.length) {
    files.forEach(file => {
      if (file.type === FileTypes.IMAGE) {
        const imgBlock = createImageBlock(messageId, { file, status: MessageBlockStatus.SUCCESS })
        blocks.push(imgBlock)
        blockIds.push(imgBlock.id)
      } else {
        const fileBlock = createFileBlock(messageId, file, { status: MessageBlockStatus.SUCCESS })
        blocks.push(fileBlock)
        blockIds.push(fileBlock.id)
      }
    })
  }

  // 内容为空也应该创建空文本块
  if (content !== undefined) {
    // Pass messageId when creating blocks
    const textBlock = createMainTextBlock(messageId, content, {
      status: MessageBlockStatus.SUCCESS
    })
    blocks.push(textBlock)
    blockIds.push(textBlock.id)
  }

  // 直接在createMessage中传入id
  const message = createMessage(
    'user',
    topic.id, // topic.id已经是string类型
    assistant.id,
    {
      id: messageId, // 直接传入ID，避免冲突
      modelId: model?.id,
      model: model,
      blocks: blockIds,
      mentions,
      type,
      usage
    }
  )

  // 不再需要手动合并ID
  return { message, blocks }
}

/**
 * 发送消息并处理助手回复
 * @param userMessage 已创建的用户消息
 * @param userMessageBlocks 用户消息关联的消息块
 * @param assistant 助手对象
 * @param topicId 主题ID
 */
export async function sendMessage(
  userMessage: Message,
  userMessageBlocks: MessageBlock[],
  assistant: Assistant,
  topicId: Topic['id']
) {
  try {
    // mock mentions model
    // userMessage.mentions = [
    //   { id: 'deepseek-ai/DeepSeek-V3', name: 'deepseek-ai/DeepSeek-V3', provider: 'silicon', group: 'deepseek-ai' },
    //   { id: 'deepseek-ai/DeepSeek-R1', name: 'deepseek-ai/DeepSeek-R1', provider: 'silicon', group: 'deepseek-ai' }
    // ]

    if (userMessage.blocks.length === 0) {
      logger.warn('sendMessage: No blocks in the provided message.')
      return
    }

    // add message to database
    await saveMessageAndBlocksToDB(userMessage, userMessageBlocks)
    await upsertMessages(userMessage)

    const mentionedModels = userMessage.mentions

    if (mentionedModels && mentionedModels.length > 0) {
      await multiModelResponses(topicId, assistant, userMessage, mentionedModels)
    } else {
      const assistantMessage = createAssistantMessage(assistant.id, topicId, {
        askId: userMessage.id,
        model: assistant.model
      })
      await saveMessageAndBlocksToDB(assistantMessage, [])
      await upsertMessages(assistantMessage)
      await fetchAndProcessAssistantResponseImpl(topicId, assistant, assistantMessage)
    }
  } catch (error) {
    logger.error('Error in sendMessage:', error)
  }
}

export async function regenerateAssistantMessage(assistantMessage: Message, assistant: Assistant) {
  const topicId = assistantMessage.topicId

  try {
    // 1. Use selector to get all messages for the topic
    const allMessagesForTopic = await getMessagesByTopicId(topicId)

    // 2. Find the original user query (Restored Logic)
    const originalUserQuery = allMessagesForTopic.find(m => m.id === assistantMessage.askId)

    if (!originalUserQuery) {
      logger.error(
        `[regenerateAssistantResponseThunk] Original user query (askId: ${assistantMessage.askId}) not found for assistant message ${assistantMessage.id}. Cannot regenerate.`
      )
      return
    }

    // 3. Verify the assistant message itself exists in entities
    const messageToResetEntity = await getMessageById(assistantMessage.id)

    if (!messageToResetEntity) {
      // No need to check topicId again as selector implicitly handles it
      logger.error(
        `[regenerateAssistantResponseThunk] Assistant message ${assistantMessage.id} not found in entities despite being in the topic list. State might be inconsistent.`
      )
      return
    }

    // 4. Get Block IDs to delete
    const blockIdsToDelete = [...(messageToResetEntity.blocks || [])]

    // 5. Reset the message entity in Database
    const resetAssistantMsg = resetAssistantMessage(
      messageToResetEntity,
      // Grouped message (mentioned model message) should not reset model and modelId, always use the original model
      assistantMessage.modelId
        ? {
            status: AssistantMessageStatus.PENDING,
            updatedAt: new Date().toISOString()
          }
        : {
            status: AssistantMessageStatus.PENDING,
            updatedAt: new Date().toISOString(),
            model: assistant.model
          }
    )

    await upsertMessages(resetAssistantMsg)
    // 6. Remove old blocks from Database
    await cleanupMultipleBlocks(blockIdsToDelete)

    // // 7. Update DB: Save the reset message state within the topic and delete old blocks
    // // Fetch the current state *after* Database updates to get the latest message list
    // // Use the selector to get the final ordered list of messages for the topic
    // const finalMessagesToSave = await getMessagesByTopicId(topicId)

    // 7. Add fetch/process call to the queue
    const queue = getTopicQueue(topicId)
    const assistantConfigForRegen = {
      ...assistant,
      ...(resetAssistantMsg.model ? { model: resetAssistantMsg.model } : {})
    }

    // Add the fetch/process call to the queue
    queue.add(
      async () => await fetchAndProcessAssistantResponseImpl(topicId, assistantConfigForRegen, resetAssistantMsg)
    )
  } catch (error) {
    logger.error('Error in regenerateAssistantMessage:', error)
  }
}

/**
 * 消息块节流器。
 * 每个消息块有独立节流器，并发更新时不会互相影响
 */
const blockUpdateThrottlers = new LRUCache<string, ReturnType<typeof throttle>>({
  max: 100,
  ttl: 1000 * 60 * 5,
  updateAgeOnGet: true
})

/**
 * 消息块 RAF 缓存。
 * 用于管理 RAF 请求创建和取消。
 */
const blockUpdateRafs = new LRUCache<string, number>({
  max: 100,
  ttl: 1000 * 60 * 5,
  updateAgeOnGet: true
})

/**
 * 获取或创建消息块专用的节流函数。
 */
const getBlockThrottler = async (id: string) => {
  if (!blockUpdateThrottlers.has(id)) {
    const throttler = throttle(async (blockUpdate: any) => {
      const existingRAF = blockUpdateRafs.get(id)

      if (existingRAF) {
        cancelAnimationFrame(existingRAF)
      }

      const rafId = requestAnimationFrame(async () => {
        await updateOneBlock({ id, changes: blockUpdate })
        blockUpdateRafs.delete(id)
      })

      blockUpdateRafs.set(id, rafId)
      await updateOneBlock({ id, changes: blockUpdate })
    }, 150)

    blockUpdateThrottlers.set(id, throttler)
  }

  return blockUpdateThrottlers.get(id)!
}

/**
 * 更新单个消息块。
 */
export const throttledBlockUpdate = async (id: string, blockUpdate: any) => {
  const throttler = await getBlockThrottler(id)
  // store.dispatch(updateOneBlock({ id, changes: blockUpdate }))
  throttler(blockUpdate)
}

/**
 * 取消单个块的节流更新，移除节流器和 RAF。
 */
export const cancelThrottledBlockUpdate = (id: string) => {
  const rafId = blockUpdateRafs.get(id)

  if (rafId) {
    cancelAnimationFrame(rafId)
    blockUpdateRafs.delete(id)
  }

  const throttler = blockUpdateThrottlers.get(id)

  if (throttler) {
    throttler.cancel()
    blockUpdateThrottlers.delete(id)
  }
}

export const saveUpdatesToDB = async (
  messageId: string,
  topicId: string,
  messageUpdates: Partial<Message>, // 需要更新的消息字段
  blocksToUpdate: MessageBlock[] // 需要更新/创建的块
) => {
  try {
    const messageDataToSave: Partial<Message> & Pick<Message, 'id' | 'topicId'> = {
      id: messageId,
      topicId,
      ...messageUpdates
    }
    await updateExistingMessageAndBlocksInDB(messageDataToSave, blocksToUpdate)
  } catch (error) {
    console.error(`[DB Save Updates] Failed for message ${messageId}:`, error)
  }
}

const updateExistingMessageAndBlocksInDB = async (
  updatedMessage: Partial<Message> & Pick<Message, 'id' | 'topicId'>,
  updatedBlocks: MessageBlock[]
) => {
  try {
    await updateMessageById(updatedMessage.id, updatedMessage)
    await upsertBlocks(updatedBlocks)
  } catch (error) {
    console.error(`[updateExistingMsg] Failed to update message ${updatedMessage.id}:`, error)
  }
}

// 新增: 辅助函数，用于获取并保存单个更新后的 Block 到数据库
export const saveUpdatedBlockToDB = async (blockId: string | null, messageId: string, topicId: string) => {
  if (!blockId) {
    console.warn('[DB Save Single Block] Received null/undefined blockId. Skipping save.')
    return
  }

  const blockToSave = await getBlockById(blockId)

  if (blockToSave) {
    await saveUpdatesToDB(messageId, topicId, {}, [blockToSave]) // Pass messageId, topicId, empty message updates, and the block
  } else {
    console.warn(`[DB Save Single Block] Block ${blockId} not found in state. Cannot save.`)
  }
}

export async function saveMessageAndBlocksToDB(message: Message, blocks: MessageBlock[], messageIndex: number = -1) {
  try {
    if (blocks.length > 0) {
      await upsertBlocks(blocks)
    }

    // get topic from database
    const topic = await getTopicById(message.topicId)
    logger.info('saveMessageAndBlocksToDB topic:', topic)

    if (topic) {
      const _messageIndex = topic.messages.findIndex(m => m.id === message.id)
      const updatedMessages = [...topic.messages]

      if (_messageIndex !== -1) {
        updatedMessages[_messageIndex] = message
      } else {
        if (messageIndex !== -1) {
          updatedMessages.splice(messageIndex, 0, message)
        } else {
          updatedMessages.push(message)
        }
      }

      await updateTopicMessages(topic.id, updatedMessages)
    } else {
      logger.error(`[saveMessageAndBlocksToDB] Topic ${message.topicId} not found.`)
    }
  } catch (error) {
    logger.error('Error saving message blocks:', error)
  }
}

// Internal function extracted from sendMessage to handle fetching and processing assistant response
export async function fetchAndProcessAssistantResponseImpl(
  topicId: string,
  assistant: Assistant,
  assistantMessage: Message
) {
  const assistantMsgId = assistantMessage.id
  let callbacks: StreamProcessorCallbacks = {}

  try {
    // 创建 BlockManager 实例
    const blockManager = new BlockManager({
      saveUpdatedBlockToDB,
      saveUpdatesToDB,
      assistantMsgId,
      topicId,
      throttledBlockUpdate,
      cancelThrottledBlockUpdate
    })

    const allMessagesForTopic = await getMessagesByTopicId(topicId)
    let messagesForContext: Message[] = []
    const userMessageId = assistantMessage.askId
    const userMessageIndex = allMessagesForTopic.findIndex(m => m?.id === userMessageId)

    if (userMessageIndex === -1) {
      logger.error(
        `[fetchAndProcessAssistantResponseImpl] Triggering user message ${userMessageId} (askId of ${assistantMsgId}) not found. Falling back.`
      )
      const assistantMessageIndexFallback = allMessagesForTopic.findIndex(m => m?.id === assistantMsgId)
      messagesForContext = (
        assistantMessageIndexFallback !== -1
          ? allMessagesForTopic.slice(0, assistantMessageIndexFallback)
          : allMessagesForTopic
      ).filter(m => m && !m.status?.includes('ing'))
    } else {
      const contextSlice = allMessagesForTopic.slice(0, userMessageIndex + 1)
      messagesForContext = contextSlice.filter(m => m && !m.status?.includes('ing'))
    }

    callbacks = createCallbacks({
      blockManager,
      topicId,
      assistantMsgId,
      saveUpdatesToDB,
      assistant
    })
    const streamProcessorCallbacks = createStreamProcessor(callbacks)

    const orchestrationService = new OrchestrationService()
    await orchestrationService.handleUserMessage(
      {
        messages: messagesForContext,
        assistant,
        options: {
          timeout: 30000
        }
      },
      streamProcessorCallbacks
    )
  } catch (error) {
    logger.error('Error in fetchAndProcessAssistantResponseImpl:', error)
  }
}

// --- Helper Function for Multi-Model Dispatch ---
// 多模型创建和发送请求的逻辑，用于用户消息多模型发送和重发
export async function multiModelResponses(
  topicId: string,
  assistant: Assistant,
  triggeringMessage: Message, // userMessage or messageToResend
  mentionedModels: Model[]
) {
  logger.info('multiModelResponses')
  const assistantMessageStubs: Message[] = []
  const tasksToQueue: { assistantConfig: Assistant; messageStub: Message }[] = []

  for (const mentionedModel of mentionedModels) {
    const assistantForThisMention = { ...assistant, model: mentionedModel }
    const assistantMessage = createAssistantMessage(assistant.id, topicId, {
      askId: triggeringMessage.id,
      model: mentionedModel,
      modelId: mentionedModel.id
    })
    await upsertMessages(assistantMessage)
    assistantMessageStubs.push(assistantMessage)
    tasksToQueue.push({ assistantConfig: assistantForThisMention, messageStub: assistantMessage })
  }

  const queue = getTopicQueue(topicId)

  for (const task of tasksToQueue) {
    queue.add(async () => {
      await fetchAndProcessAssistantResponseImpl(topicId, task.assistantConfig, task.messageStub)
    })
  }
}
// --- End Helper Function ---

/**
 * 批量清理多个消息块。
 */
export async function cleanupMultipleBlocks(blockIds: string[]) {
  // blockIds.forEach(id => {
  //   cancelThrottledBlockUpdate(id)
  // })

  // const getBlocksFiles = async (blockIds: string[]) => {
  //   const blocks = await Promise.all(blockIds.map(id => getBlockById(id)))

  //   const files = blocks
  //     .filter((block): block is MessageBlock => block !== null)
  //     .filter(block => block.type === MessageBlockType.FILE || block.type === MessageBlockType.IMAGE)
  //     .map(block => block.file)
  //     .filter((file): file is FileType => file !== undefined)
  //   return isEmpty(files) ? [] : files
  // }

  // const cleanupFiles = async (files: FileType[]) => {
  //   await Promise.all(files.map(file => FileManager.deleteFile(file.id, false)))
  // }

  // getBlocksFiles(blockIds).then(cleanupFiles)

  if (blockIds.length > 0) {
    await removeManyBlocks(blockIds)
  }
}
