import { messageDatabase } from '@database'

import { loggerService } from '@/services/LoggerService'
import type { ExternalToolResult } from '@/types'
import type { CitationMessageBlock } from '@/types/message'
import { MessageBlockStatus, MessageBlockType } from '@/types/message'
import { createCitationBlock } from '@/utils/messageUtils/create'
import { findMainTextBlocks } from '@/utils/messageUtils/find'

import type { BlockManager } from '../BlockManager'

const logger = loggerService.withContext('Citation Callbacks')
interface CitationCallbacksDependencies {
  blockManager: BlockManager
  assistantMsgId: string
}

export const createCitationCallbacks = (deps: CitationCallbacksDependencies) => {
  const { blockManager, assistantMsgId } = deps

  // 内部维护的状态
  let citationBlockId: string | null = null

  return {
    onExternalToolInProgress: async () => {
      const citationBlock = createCitationBlock(assistantMsgId, {}, { status: MessageBlockStatus.PROCESSING })
      citationBlockId = citationBlock.id
      await blockManager.handleBlockTransition(citationBlock, MessageBlockType.CITATION)
      logger.debug('onExternalToolInProgress', citationBlock)
    },

    onExternalToolComplete: (externalToolResult: ExternalToolResult) => {
      if (citationBlockId) {
        const changes: Partial<CitationMessageBlock> = {
          response: externalToolResult.webSearch,
          knowledge: externalToolResult.knowledge,
          status: MessageBlockStatus.SUCCESS
        }
        blockManager.smartBlockUpdate(citationBlockId, changes, MessageBlockType.CITATION, true)
        logger.debug('onExternalToolComplete', externalToolResult)
      } else {
        console.error('[onExternalToolComplete] citationBlockId is null. Cannot update.')
      }
    },

    onLLMWebSearchInProgress: async () => {
      if (blockManager.hasInitialPlaceholder) {
        // blockManager.lastBlockType = MessageBlockType.CITATION
        citationBlockId = blockManager.initialPlaceholderBlockId!

        const changes = {
          type: MessageBlockType.CITATION,
          status: MessageBlockStatus.PROCESSING
        }
        blockManager.smartBlockUpdate(citationBlockId, changes, MessageBlockType.CITATION)
        logger.debug('onLLMWebSearchInProgress', citationBlockId)
      } else {
        const citationBlock = createCitationBlock(assistantMsgId, {}, { status: MessageBlockStatus.PROCESSING })
        citationBlockId = citationBlock.id
        await blockManager.handleBlockTransition(citationBlock, MessageBlockType.CITATION)
        logger.debug('onLLMWebSearchInProgress', citationBlock)
      }
    },

    onLLMWebSearchComplete: async (llmWebSearchResult: any) => {
      const blockId = citationBlockId || blockManager.initialPlaceholderBlockId

      if (blockId) {
        const changes: Partial<CitationMessageBlock> = {
          type: MessageBlockType.CITATION,
          response: llmWebSearchResult,
          status: MessageBlockStatus.SUCCESS
        }
        blockManager.smartBlockUpdate(blockId, changes, MessageBlockType.CITATION, true)

        const assistantMessage = await messageDatabase.getMessageById(assistantMsgId)

        if (!assistantMessage) {
          logger.error(`[onLLMWebSearchComplete] Message ${assistantMsgId} not found.`)
          return
        }

        const existingMainTextBlocks = await findMainTextBlocks(assistantMessage)

        if (existingMainTextBlocks.length > 0) {
          const existingMainTextBlock = existingMainTextBlocks[0]
          const currentRefs = existingMainTextBlock.citationReferences || []
          const mainTextChanges = {
            citationReferences: [...currentRefs, { blockId, citationBlockSource: llmWebSearchResult.source }]
          }
          blockManager.smartBlockUpdate(existingMainTextBlock.id, mainTextChanges, MessageBlockType.MAIN_TEXT, true)
        }

        if (blockManager.hasInitialPlaceholder) {
          citationBlockId = blockManager.initialPlaceholderBlockId
        }

        logger.debug('onLLMWebSearchComplete', llmWebSearchResult)
      } else {
        const citationBlock = createCitationBlock(
          assistantMsgId,
          {
            response: llmWebSearchResult
          },
          {
            status: MessageBlockStatus.SUCCESS
          }
        )
        citationBlockId = citationBlock.id

        const assistantMessage = await messageDatabase.getMessageById(assistantMsgId)

        if (!assistantMessage) {
          logger.error(`[onLLMWebSearchComplete] Message ${assistantMsgId} not found.`)
          return
        }

        const existingMainTextBlocks = await findMainTextBlocks(assistantMessage)

        if (existingMainTextBlocks.length > 0) {
          const existingMainTextBlock = existingMainTextBlocks[0]
          const currentRefs = existingMainTextBlock.citationReferences || []
          const mainTextChanges = {
            citationReferences: [...currentRefs, { citationBlockId, citationBlockSource: llmWebSearchResult.source }]
          }
          blockManager.smartBlockUpdate(existingMainTextBlock.id, mainTextChanges, MessageBlockType.MAIN_TEXT, true)
        }

        await blockManager.handleBlockTransition(citationBlock, MessageBlockType.CITATION)
        logger.debug('onLLMWebSearchComplete', citationBlock)
      }
    },

    // 暴露给外部的方法，用于textCallbacks中获取citationBlockId
    getCitationBlockId: () => citationBlockId
  }
}
