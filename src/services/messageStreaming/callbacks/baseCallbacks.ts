import { messageDatabase } from '@database'
import { NoObjectGeneratedError } from 'ai'

import { loggerService } from '@/services/LoggerService'
import { estimateMessagesUsage } from '@/services/TokenService'
import type { Assistant } from '@/types/assistant'
import type { AiSdkErrorUnion } from '@/types/error'
import type { Message, PlaceholderMessageBlock, Response } from '@/types/message'
import { AssistantMessageStatus, MessageBlockStatus, MessageBlockType } from '@/types/message'
import { isAbortError, serializeError } from '@/utils/error'
import { createBaseMessageBlock, createErrorBlock } from '@/utils/messageUtils/create'
import { findAllBlocks } from '@/utils/messageUtils/find'

import type { BlockManager } from '../BlockManager'

const logger = loggerService.withContext('Base Callbacks')

interface BaseCallbacksDependencies {
  blockManager: BlockManager
  topicId: string
  assistantMsgId: string
  saveUpdatesToDB: any
  assistant: Assistant
  startTime: number
  onNotify?: (message: string) => void
}

export const createBaseCallbacks = async (deps: BaseCallbacksDependencies) => {
  const { blockManager, topicId, assistantMsgId, saveUpdatesToDB, assistant, startTime, onNotify } = deps

  // 防止 onError 被多次调用
  let errorHandled = false

  // 通用的 block 查找函数
  const findBlockIdForCompletion = async (message?: any) => {
    // 优先使用 BlockManager 中的 activeBlockInfo
    const activeBlockInfo = blockManager.activeBlockInfo

    if (activeBlockInfo) {
      return activeBlockInfo.id
    }

    // 如果没有活跃的block，从message中查找最新的block作为备选
    const targetMessage = message || (await messageDatabase.getMessagesByTopicId(assistantMsgId))

    if (targetMessage) {
      const allBlocks = await findAllBlocks(targetMessage)

      if (allBlocks.length > 0) {
        return allBlocks[allBlocks.length - 1].id // 返回最新的block
      }
    }

    // 最后的备选方案：从 blockManager 获取占位符块ID
    return blockManager.initialPlaceholderBlockId
  }

  return {
    onLLMResponseCreated: async () => {
      const baseBlock = createBaseMessageBlock(assistantMsgId, MessageBlockType.UNKNOWN, {
        status: MessageBlockStatus.PROCESSING
      })
      await blockManager.handleBlockTransition(baseBlock as PlaceholderMessageBlock, MessageBlockType.UNKNOWN)
      logger.info('onLLMResponseCreated', baseBlock)
    },
    // onBlockCreated: async () => {
    //   if (blockManager.hasInitialPlaceholder) {
    //     return
    //   }
    //   console.log('onBlockCreated')
    //   const baseBlock = createBaseMessageBlock(assistantMsgId, MessageBlockType.UNKNOWN, {
    //     status: MessageBlockStatus.PROCESSING
    //   })
    //   await blockManager.handleBlockTransition(baseBlock as PlaceholderMessageBlock, MessageBlockType.UNKNOWN)
    // },

    onError: async (error: AiSdkErrorUnion) => {
      // 防止重复处理错误
      if (errorHandled) {
        logger.debug('onError already handled, skipping duplicate call')
        return
      }
      errorHandled = true

      // Early return for NoObjectGeneratedError (no error block needed)
      if (NoObjectGeneratedError.isInstance(error)) {
        logger.debug('NoObjectGeneratedError detected, skipping error handling')
        return
      }

      const isErrorTypeAbort = isAbortError(error)

      // Use serializeError utility for proper serialization
      const serializableError = serializeError(error)
      if (isErrorTypeAbort) {
        serializableError.message = 'pause_placeholder'
      }

      // Duration-based notification for long-running errors
      const duration = Date.now() - startTime
      if (!isErrorTypeAbort && duration > 30 * 1000) {
        onNotify?.(serializableError.message ?? 'An error occurred')
      }

      const possibleBlockId = await findBlockIdForCompletion()

      if (possibleBlockId) {
        const changes = {
          status: isErrorTypeAbort ? MessageBlockStatus.PAUSED : MessageBlockStatus.ERROR
        }
        blockManager.smartBlockUpdate(possibleBlockId, changes, blockManager.lastBlockType!, true)
      }

      const errorBlock = createErrorBlock(assistantMsgId, serializableError, { status: MessageBlockStatus.SUCCESS })
      await blockManager.handleBlockTransition(errorBlock, MessageBlockType.ERROR)
      const errorStatus = isErrorTypeAbort ? AssistantMessageStatus.SUCCESS : AssistantMessageStatus.ERROR

      const toBeUpdatedMessage = await messageDatabase.getMessageById(assistantMsgId)

      if (!toBeUpdatedMessage) {
        logger.error(`[upsertBlockReference] Message ${assistantMsgId} not found.`)
        return
      }

      toBeUpdatedMessage.status = errorStatus

      const updatedMessage = await messageDatabase.upsertMessages(toBeUpdatedMessage)

      if (!updatedMessage) {
        logger.error(`[onError] Failed to update message ${toBeUpdatedMessage.id} in state.`)
        return
      }

      await saveUpdatesToDB(assistantMsgId, topicId, errorStatus, [])
      logger.error('onError', errorBlock)
    },

    onComplete: async (status: AssistantMessageStatus, response?: Response) => {
      const finalAssistantMsg = await messageDatabase.getMessageById(assistantMsgId)

      if (!finalAssistantMsg) {
        logger.error(`[onComplete] Assistant message ${assistantMsgId} not found.`)
        return
      }

      if (status === 'success' && finalAssistantMsg) {
        const userMsgId = finalAssistantMsg.askId
        const orderedMsgs = await messageDatabase.getMessagesByTopicId(topicId)
        const userMsgIndex = orderedMsgs.findIndex(m => m.id === userMsgId)
        const contextForUsage = userMsgIndex !== -1 ? orderedMsgs.slice(0, userMsgIndex + 1) : []
        const finalContextWithAssistant = [...contextForUsage, finalAssistantMsg]

        const possibleBlockId = await findBlockIdForCompletion(finalAssistantMsg)

        if (possibleBlockId) {
          const changes = {
            status: MessageBlockStatus.SUCCESS
          }
          await blockManager.smartBlockUpdate(possibleBlockId, changes, blockManager.lastBlockType!, true)
        }

        if (
          response &&
          (response.usage?.total_tokens === 0 ||
            response?.usage?.prompt_tokens === 0 ||
            response?.usage?.completion_tokens === 0)
        ) {
          response.usage = await estimateMessagesUsage({ assistant, messages: finalContextWithAssistant })
        }
      }

      if (response && response.metrics) {
        if (response.metrics.completion_tokens === 0 && response.usage?.completion_tokens) {
          response = {
            ...response,
            metrics: {
              ...response.metrics,
              completion_tokens: response.usage.completion_tokens
            }
          }
        }
      }

      const messageUpdates: Partial<Message> = { status, metrics: response?.metrics, usage: response?.usage }

      await messageDatabase.upsertMessages({ ...finalAssistantMsg, ...messageUpdates })
      await saveUpdatesToDB(assistantMsgId, topicId, messageUpdates, [])
      logger.debug('onComplete', messageUpdates)
    }
  }
}
