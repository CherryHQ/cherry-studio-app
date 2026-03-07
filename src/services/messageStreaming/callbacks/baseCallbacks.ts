/**
 * @fileoverview Base callbacks for streaming message processing
 *
 * This module creates the base callback handlers used during message streaming:
 * - onLLMResponseCreated: Initial block creation
 * - onError: Error handling and finalization
 * - onComplete: Success completion and finalization
 *
 * ARCHITECTURE NOTE:
 * These callbacks use StreamingService for state management.
 * Persistence happens via streamingService.finalize() at the end.
 */

import { loggerService } from '@/services/LoggerService'
import { estimateMessagesUsage } from '@/services/TokenService'
import type { Assistant } from '@/types/assistant'
import type { AiSdkErrorUnion } from '@/types/error'
import type { PlaceholderMessageBlock, Response, ThinkingMessageBlock } from '@/types/message'
import { AssistantMessageStatus, MessageBlockStatus, MessageBlockType } from '@/types/message'
import { isAbortError, serializeError } from '@/utils/error'
import { createBaseMessageBlock, createErrorBlock } from '@/utils/messageUtils/create'
import { findAllBlocks } from '@/utils/messageUtils/find'

import type { BlockManager } from '../BlockManager'
import { streamingService } from '../StreamingService'

const logger = loggerService.withContext('BaseCallbacks')

interface BaseCallbacksDependencies {
  blockManager: BlockManager
  topicId: string
  assistantMsgId: string
  assistant: Assistant
  getCurrentThinkingInfo?: () => { blockId: string | null; millsec: number }
}

export const createBaseCallbacks = (deps: BaseCallbacksDependencies) => {
  const { blockManager, assistantMsgId, assistant, getCurrentThinkingInfo } = deps

  // Track start time internally
  const startTime = Date.now()

  // Prevent onError from being called multiple times
  let errorHandled = false

  /**
   * Find the block ID that should receive completion updates.
   * Priority: active block > latest block in message > initial placeholder
   */
  const findBlockIdForCompletion = async () => {
    // Priority 1: Use active block from BlockManager
    const activeBlockInfo = blockManager.activeBlockInfo
    if (activeBlockInfo) {
      return activeBlockInfo.id
    }

    // Priority 2: Find latest block from StreamingService message
    const message = streamingService.getMessage(assistantMsgId)
    if (message) {
      const allBlocks = await findAllBlocks(message)
      if (allBlocks.length > 0) {
        return allBlocks[allBlocks.length - 1].id
      }
    }

    // Priority 3: Initial placeholder block
    return blockManager.initialPlaceholderBlockId
  }

  return {
    onLLMResponseCreated: async () => {
      const baseBlock = createBaseMessageBlock(assistantMsgId, MessageBlockType.UNKNOWN, {
        status: MessageBlockStatus.PROCESSING
      })
      await blockManager.handleBlockTransition(baseBlock as PlaceholderMessageBlock, MessageBlockType.UNKNOWN)
      logger.debug('onLLMResponseCreated', { blockId: baseBlock.id })
    },

    onError: async (error: AiSdkErrorUnion) => {
      // Prevent duplicate error handling
      if (errorHandled) {
        logger.debug('onError already handled, skipping duplicate call')
        return
      }
      errorHandled = true

      const isErrorTypeAbort = isAbortError(error)
      const serializableError = serializeError(error)

      if (isErrorTypeAbort) {
        serializableError.message = 'pause_placeholder'
      }

      // Find the block to update
      const possibleBlockId = await findBlockIdForCompletion()

      if (possibleBlockId) {
        // Update previous block status
        const changes: Partial<ThinkingMessageBlock> = {
          status: isErrorTypeAbort ? MessageBlockStatus.PAUSED : MessageBlockStatus.ERROR
        }

        // 如果是 thinking block，保留实际思考时间
        if (blockManager.lastBlockType === MessageBlockType.THINKING) {
          const thinkingInfo = getCurrentThinkingInfo?.()
          if (thinkingInfo?.blockId === possibleBlockId && thinkingInfo?.millsec && thinkingInfo.millsec > 0) {
            changes.thinking_millsec = thinkingInfo.millsec
          }
        }
        blockManager.smartBlockUpdate(possibleBlockId, changes, blockManager.lastBlockType!, true)
      }

      // Update all STREAMING blocks to PAUSED/ERROR
      const currentMessage = streamingService.getMessage(assistantMsgId)
      if (currentMessage) {
        const allBlockRefs = await findAllBlocks(currentMessage)
        const thinkingInfo = getCurrentThinkingInfo?.()

        for (const blockRef of allBlockRefs) {
          const block = streamingService.getBlock(blockRef.id)
          if (block && block.status === MessageBlockStatus.STREAMING && block.id !== possibleBlockId) {
            const changes: Partial<ThinkingMessageBlock> = {
              status: isErrorTypeAbort ? MessageBlockStatus.PAUSED : MessageBlockStatus.ERROR
            }

            // If thinking block with timing info, preserve it
            if (
              block.type === MessageBlockType.THINKING &&
              thinkingInfo?.blockId === block.id &&
              thinkingInfo?.millsec &&
              thinkingInfo.millsec > 0
            ) {
              changes.thinking_millsec = thinkingInfo.millsec
            }

            streamingService.updateBlock(block.id, changes)
          }
        }
      }

      // Create error block
      const errorBlock = createErrorBlock(assistantMsgId, serializableError, { status: MessageBlockStatus.SUCCESS })
      await blockManager.handleBlockTransition(errorBlock, MessageBlockType.ERROR)

      const finalStatus = isErrorTypeAbort ? AssistantMessageStatus.SUCCESS : AssistantMessageStatus.ERROR

      // Finalize: persist to SQLite
      await streamingService.finalize(assistantMsgId, finalStatus)

      logger.debug('onError finalized', { assistantMsgId, finalStatus, duration: Date.now() - startTime })
    },

    onComplete: async (status: AssistantMessageStatus, response?: Response) => {
      const finalAssistantMsg = streamingService.getMessage(assistantMsgId)

      if (!finalAssistantMsg) {
        logger.error(`[onComplete] Assistant message ${assistantMsgId} not found.`)
        return
      }

      if (status === 'success') {
        const possibleBlockId = await findBlockIdForCompletion()

        if (possibleBlockId && blockManager.lastBlockType) {
          blockManager.smartBlockUpdate(
            possibleBlockId,
            { status: MessageBlockStatus.SUCCESS },
            blockManager.lastBlockType,
            true
          )
        }

        // Estimate usage if not provided
        const isOpenRouter = assistant.model?.provider === 'openrouter'
        if (
          !isOpenRouter &&
          response &&
          (response.usage?.total_tokens === 0 ||
            response?.usage?.prompt_tokens === 0 ||
            response?.usage?.completion_tokens === 0)
        ) {
          // Use context from task for usage estimation
          const task = streamingService.getTask(assistantMsgId)
          if (task && 'contextMessages' in task && task.contextMessages && task.contextMessages.length > 0) {
            // Include the final assistant message in context for accurate estimation
            const finalContextWithAssistant = [...task.contextMessages, finalAssistantMsg]
            const usage = await estimateMessagesUsage({ assistant, messages: finalContextWithAssistant })
            response.usage = usage
          } else {
            logger.debug('Skipping usage estimation - contextMessages not available in task')
          }
        }
      }

      // Handle metrics completion_tokens fallback
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

      // Update message with final stats before finalize
      if (response) {
        streamingService.updateMessage(assistantMsgId, {
          metrics: response.metrics,
          usage: response.usage
        })
      }

      // Finalize session and persist to database
      await streamingService.finalize(assistantMsgId, status)

      logger.debug('onComplete finished')
    }
  }
}
