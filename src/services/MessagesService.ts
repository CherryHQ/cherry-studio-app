import { messageBlockDatabase, messageDatabase } from '@database'

import ModernAiProvider from '@/aiCore/index_new'
import type { AiSdkMiddlewareConfig } from '@/aiCore/middleware/AiSdkMiddlewareBuilder'
import { buildStreamTextParams, convertMessagesToSdkMessages } from '@/aiCore/prepareParams'
import { loggerService } from '@/services/LoggerService'
import type { Assistant, Model, Topic, Usage } from '@/types/assistant'
import { ChunkType } from '@/types/chunk'
import type { FileMetadata } from '@/types/file'
import { FileTypes } from '@/types/file'
import type { Message, MessageBlock } from '@/types/message'
import { AssistantMessageStatus, MessageBlockStatus, MessageBlockType } from '@/types/message'
import { uuid } from '@/utils'
import { addAbortController } from '@/utils/abortController'
import {
  createAssistantMessage,
  createFileBlock,
  createImageBlock,
  createMainTextBlock,
  createMessage,
  createTranslationBlock,
  resetAssistantMessage
} from '@/utils/messageUtils/create'
import { getTopicQueue } from '@/utils/queue'

import { fetchTopicNaming } from './ApiService'
import { assistantService, getDefaultModel } from './AssistantService'
import { BlockManager, createCallbacks } from './messageStreaming'
import { transformMessagesAndFetch } from './OrchestrationService'
import { getAssistantProvider } from './ProviderService'
import type { StreamProcessorCallbacks } from './StreamProcessingService'
import { createStreamProcessor } from './StreamProcessingService'
import { topicService } from './TopicService'

const logger = loggerService.withContext('Messages Service')

const finishTopicLoading = async (topicId: string) => {
  await topicService.updateTopic(topicId, { isLoading: false })
}

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
  files?: FileMetadata[]
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
 * @param dispatch Redux dispatch 函数
 */
export async function sendMessage(
  userMessage: Message,
  userMessageBlocks: MessageBlock[],
  assistant: Assistant,
  topicId: Topic['id']
) {
  try {
    if (userMessage.blocks.length === 0) {
      logger.warn('sendMessage: No blocks in the provided message.')
      return
    }

    // add message to database
    await saveMessageAndBlocksToDB(userMessage, userMessageBlocks)

    const mentionedModels = userMessage.mentions

    if (mentionedModels && mentionedModels.length > 0) {
      await multiModelResponses(topicId, assistant, userMessage, mentionedModels)
    } else {
      const assistantMessage = createAssistantMessage(assistant.id, topicId, {
        askId: userMessage.id,
        model: assistant.model
      })
      await saveMessageAndBlocksToDB(assistantMessage, [])
      await fetchAndProcessAssistantResponseImpl(topicId, assistant, assistantMessage)
    }
  } catch (error) {
    logger.error('Error in sendMessage:', error)
    await finishTopicLoading(topicId)
  }
}

export async function regenerateAssistantMessage(assistantMessage: Message, assistant: Assistant) {
  const topicId = assistantMessage.topicId

  try {
    // 1. Use selector to get all messages for the topic
    const allMessagesForTopic = await messageDatabase.getMessagesByTopicId(topicId)

    // 2. Find the original user query (Restored Logic)
    const originalUserQuery = allMessagesForTopic.find(m => m.id === assistantMessage.askId)

    if (!originalUserQuery) {
      logger.error(
        `[regenerateAssistantResponseThunk] Original user query (askId: ${assistantMessage.askId}) not found for assistant message ${assistantMessage.id}. Cannot regenerate.`
      )
      return
    }

    // 3. Verify the assistant message itself exists in entities
    const messageToResetEntity = await messageDatabase.getMessageById(assistantMessage.id)

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
      assistantMessage.mentions
        ? {
            status: AssistantMessageStatus.PENDING,
            updatedAt: Date.now()
          }
        : {
            status: AssistantMessageStatus.PENDING,
            updatedAt: Date.now(),
            model: assistant.model
          }
    )

    await messageDatabase.upsertMessages(resetAssistantMsg)
    // 6. Remove old blocks from Database
    await cleanupMultipleBlocks(blockIdsToDelete)

    // // 7. Update DB: Save the reset message state within the topic and delete old blocks
    // // Fetch the current state *after* Database updates to get the latest message list
    // // Use the selector to get the final ordered list of messages for the topic
    // const finalMessagesToSave = await messageDatabase.getMessagesByTopicId(topicId)

    // 7. Add fetch/process call to the queue
    const assistantConfigForRegen = {
      ...assistant,
      ...(resetAssistantMsg.model ? { model: resetAssistantMsg.model } : {})
    }

    // Add the fetch/process call to the queue
    await fetchAndProcessAssistantResponseImpl(topicId, assistantConfigForRegen, resetAssistantMsg)
  } catch (error) {
    logger.error('Error in regenerateAssistantMessage:', error)
  } finally {
    await finishTopicLoading(topicId)
  }
}

const BLOCK_UPDATE_BATCH_INTERVAL = 180
type BlockUpdatePayload = Partial<MessageBlock>

const pendingBlockUpdates = new Map<string, BlockUpdatePayload>()
let blockFlushTimer: ReturnType<typeof setTimeout> | null = null
let blockFlushInFlight: Promise<void> | null = null

const mergeBlockUpdates = (
  existing: BlockUpdatePayload | undefined,
  incoming: BlockUpdatePayload
): BlockUpdatePayload => {
  if (!existing) {
    return { ...incoming } as BlockUpdatePayload
  }

  return { ...existing, ...incoming } as BlockUpdatePayload
}

const waitForCurrentBlockFlush = async () => {
  if (!blockFlushInFlight) return

  try {
    await blockFlushInFlight
  } catch (error) {
    console.error('[BlockBatch] Pending flush failed:', error)
  }
}

const flushPendingBlockUpdates = async (ids?: string[]): Promise<void> => {
  const targetIds = ids?.length ? ids : Array.from(pendingBlockUpdates.keys())

  if (targetIds.length === 0) {
    return
  }

  const updates: { id: string; changes: BlockUpdatePayload }[] = []

  for (const id of targetIds) {
    const payload = pendingBlockUpdates.get(id)

    if (!payload) {
      continue
    }

    updates.push({ id, changes: payload })
    pendingBlockUpdates.delete(id)
  }

  if (updates.length === 0) {
    return
  }

  try {
    for (const { id, changes } of updates) {
      await messageBlockDatabase.updateOneBlock({ id, changes })
    }
  } catch (error) {
    for (const { id, changes } of updates) {
      const existing = pendingBlockUpdates.get(id)
      pendingBlockUpdates.set(id, mergeBlockUpdates(existing, changes))
    }

    console.error('[BlockBatch] Failed to persist block updates:', error)
    throw error
  }
}

const executeBlockFlush = async (ids?: string[]) => {
  await waitForCurrentBlockFlush()

  const flushPromise = flushPendingBlockUpdates(ids)
  blockFlushInFlight = flushPromise

  try {
    await flushPromise
  } finally {
    if (blockFlushInFlight === flushPromise) {
      blockFlushInFlight = null
    }
  }
}

const scheduleBlockFlush = () => {
  if (blockFlushTimer) {
    return
  }

  blockFlushTimer = setTimeout(() => {
    blockFlushTimer = null
    void executeBlockFlush()
  }, BLOCK_UPDATE_BATCH_INTERVAL)
}

const flushSpecificBlocks = async (ids: string[]) => {
  if (!ids.length) {
    return
  }

  const hasPending = ids.some(id => pendingBlockUpdates.has(id))

  if (!hasPending) {
    await waitForCurrentBlockFlush()
    return
  }

  await executeBlockFlush(ids)
}

/**
 * 更新单个消息块，使用批量缓冲策略。
 */
export const throttledBlockUpdate = async (id: string, blockUpdate: BlockUpdatePayload) => {
  const merged = mergeBlockUpdates(pendingBlockUpdates.get(id), blockUpdate)
  pendingBlockUpdates.set(id, merged)
  scheduleBlockFlush()
}

/**
 * 取消单个块的批量更新，并等待当前写操作完成。
 */
export const cancelThrottledBlockUpdate = async (id: string) => {
  pendingBlockUpdates.delete(id)

  if (pendingBlockUpdates.size === 0 && blockFlushTimer) {
    clearTimeout(blockFlushTimer)
    blockFlushTimer = null
  }

  await waitForCurrentBlockFlush()
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
    await messageDatabase.updateMessageById(updatedMessage.id, updatedMessage)
    await messageBlockDatabase.upsertBlocks(updatedBlocks)
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

  await flushSpecificBlocks([blockId])

  const blockToSave = await messageBlockDatabase.getBlockById(blockId)

  if (blockToSave) {
    await saveUpdatesToDB(messageId, topicId, {}, [blockToSave]) // Pass messageId, topicId, empty message updates, and the block
  } else {
    console.warn(`[DB Save Single Block] Block ${blockId} not found in state. Cannot save.`)
  }
}

export async function saveMessageAndBlocksToDB(message: Message, blocks: MessageBlock[]) {
  try {
    await messageDatabase.upsertMessages(message)

    if (blocks.length > 0) {
      await messageBlockDatabase.upsertBlocks(blocks)
    }
  } catch (error) {
    logger.error('Error saving message blocks:', error)
    throw error
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
    await topicService.updateTopic(topicId, { isLoading: true })

    // 创建 BlockManager 实例
    const blockManager = new BlockManager({
      saveUpdatedBlockToDB,
      saveUpdatesToDB,
      assistantMsgId,
      topicId,
      throttledBlockUpdate,
      cancelThrottledBlockUpdate
    })

    const allMessagesForTopic = await messageDatabase.getMessagesByTopicId(topicId)
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

    callbacks = await createCallbacks({
      blockManager,
      topicId,
      assistantMsgId,
      saveUpdatesToDB,
      assistant
    })
    const streamProcessorCallbacks = createStreamProcessor(callbacks)

    const abortController = new AbortController()
    addAbortController(userMessageId!, () => abortController.abort())

    await transformMessagesAndFetch(
      {
        messages: messagesForContext,
        assistant,
        topicId,
        options: {
          signal: abortController.signal,
          timeout: 30000
        }
      },
      streamProcessorCallbacks
    )
  } catch (error) {
    logger.error('Error in fetchAndProcessAssistantResponseImpl:', error)

    // 统一错误处理：确保 loading 状态被正确设置，避免队列任务卡住
    try {
      await callbacks.onError?.(error)
    } catch (callbackError) {
      logger.error('Error in onError callback:', callbackError as Error)
    } finally {
      // 确保无论如何都设置 loading 为 false（onError 回调中已设置，这里是保险）
      await topicService.updateTopic(topicId, { isLoading: false })
    }
  } finally {
    await finishTopicLoading(topicId)
    await fetchTopicNaming(topicId)
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
    await messageDatabase.upsertMessages(assistantMessage)
    assistantMessageStubs.push(assistantMessage)
    tasksToQueue.push({ assistantConfig: assistantForThisMention, messageStub: assistantMessage })
  }

  const queue = getTopicQueue(topicId)
  const queuedTasks = tasksToQueue.map(task =>
    queue.add(async () => {
      await fetchAndProcessAssistantResponseImpl(topicId, task.assistantConfig, task.messageStub)
    })
  )

  await Promise.all(queuedTasks)
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
  //   const blocks = await Promise.all(blockIds.map(id => messageBlockDatabase.getBlockById(id)))

  //   const files = blocks
  //     .filter((block): block is MessageBlock => block !== null)
  //     .filter(block => block.type === MessageBlockType.FILE || block.type === MessageBlockType.IMAGE)
  //     .map(block => block.file)
  //     .filter((file): file is FileMetadata => file !== undefined)
  //   return isEmpty(files) ? [] : files
  // }

  // const cleanupFiles = async (files: FileMetadata[]) => {
  //   await Promise.all(files.map(file => FileManager.deleteFile(file.id, false)))
  // }

  // getBlocksFiles(blockIds).then(cleanupFiles)

  if (blockIds.length > 0) {
    await messageBlockDatabase.removeManyBlocks(blockIds)
  }
}

export async function deleteMessagesByTopicId(topicId: string): Promise<void> {
  try {
    return messageDatabase.deleteMessagesByTopicId(topicId)
  } catch (error) {
    logger.error('Error in deleteMessagesByTopicId:', error)
    throw error
  }
}

export async function deleteMessageById(messageId: string): Promise<void> {
  try {
    // await deleteBlocksByMessageId(messageId)
    return messageDatabase.deleteMessageById(messageId)
  } catch (error) {
    logger.error('Error in deleteMessageById:', error)
    throw error
  }
}

export async function fetchTranslateThunk(assistantMessageId: string, message: Message) {
  let callbacks: StreamProcessorCallbacks = {}
  const translateAssistant = await assistantService.getAssistant('translate')

  if (!translateAssistant) {
    throw new Error('Translate assistant not found')
  }

  const newBlock = createTranslationBlock(assistantMessageId, '', {
    status: MessageBlockStatus.STREAMING
  })

  // 创建 BlockManager 实例
  const blockManager = new BlockManager({
    saveUpdatedBlockToDB,
    saveUpdatesToDB,
    assistantMsgId: assistantMessageId,
    topicId: message.topicId,
    throttledBlockUpdate,
    cancelThrottledBlockUpdate
  })

  callbacks = await createCallbacks({
    blockManager,
    topicId: message.topicId,
    assistantMsgId: assistantMessageId,
    saveUpdatesToDB,
    assistant: translateAssistant
  })

  callbacks.onTextStart = async () => {
    if (blockManager.hasInitialPlaceholder) {
      logger.debug('onTextStart hasInitialPlaceholder')
      const changes = {
        type: MessageBlockType.TRANSLATION,
        content: '',
        status: MessageBlockStatus.STREAMING
      }
      newBlock.id = blockManager.initialPlaceholderBlockId!
      blockManager.smartBlockUpdate(newBlock.id, changes, MessageBlockType.TRANSLATION, true)
      logger.debug('onTextStart', changes)
    }
  }

  callbacks.onTextChunk = async (text: string) => {
    if (text) {
      const blockChanges: Partial<MessageBlock> = {
        content: text,
        status: MessageBlockStatus.STREAMING
      }
      blockManager.smartBlockUpdate(newBlock.id, blockChanges, MessageBlockType.TRANSLATION)
      logger.info('onTextChunk', blockChanges)
    }
  }

  callbacks.onTextComplete = async (finalText: string) => {
    console.log('onTextComplete', newBlock, finalText)

    if (newBlock.id) {
      const changes = {
        content: finalText,
        status: MessageBlockStatus.SUCCESS
      }
      blockManager.smartBlockUpdate(newBlock.id, changes, MessageBlockType.TRANSLATION, true)
      logger.debug('onTextComplete', changes)
    } else {
      logger.warn(
        `[onTextComplete] Received text.complete but last block was not MAIN_TEXT (was ${blockManager.lastBlockType}) or lastBlockId is null.`
      )
    }
  }

  const streamProcessorCallbacks = createStreamProcessor(callbacks)

  if (!translateAssistant.defaultModel) {
    throw new Error('Translate assistant model is not defined')
  }

  const provider = await getAssistantProvider(translateAssistant)
  message = {
    ...message,
    role: 'user'
  }
  const llmMessages = await convertMessagesToSdkMessages([message], translateAssistant.defaultModel)

  const AI = new ModernAiProvider(translateAssistant.defaultModel || getDefaultModel(), provider)
  const { params: aiSdkParams, modelId } = await buildStreamTextParams(llmMessages, translateAssistant, provider)

  const middlewareConfig: AiSdkMiddlewareConfig = {
    streamOutput: true,
    onChunk: streamProcessorCallbacks,
    model: translateAssistant.defaultModel,
    provider: provider,
    enableReasoning: false,
    isPromptToolUse: false,
    isSupportedToolUse: false,
    isImageGenerationEndpoint: false,
    enableWebSearch: false,
    enableGenerateImage: false,
    enableUrlContext: false,
    mcpTools: []
  }

  try {
    streamProcessorCallbacks({ type: ChunkType.LLM_RESPONSE_CREATED })
    return (
      (
        await AI.completions(modelId, aiSdkParams, {
          ...middlewareConfig,
          assistant: translateAssistant,
          topicId: message.topicId,
          callType: 'chat',
          uiMessages: [message]
        })
      ).getText() || ''
    )
  } catch (error: any) {
    logger.error('Error during translation:', error)
    return ''
  }
}
