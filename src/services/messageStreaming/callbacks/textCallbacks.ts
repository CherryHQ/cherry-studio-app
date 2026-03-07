import { loggerService } from '@/services/LoggerService'
import type { CitationMessageBlock, MessageBlock } from '@/types/message'
import { MessageBlockStatus, MessageBlockType } from '@/types/message'
import { WebSearchSource } from '@/types/websearch'
import { createMainTextBlock } from '@/utils/messageUtils/create'

import type { BlockManager } from '../BlockManager'
import { streamingService } from '../StreamingService'

const logger = loggerService.withContext('TextCallbacks')

interface TextCallbacksDependencies {
  blockManager: BlockManager
  assistantMsgId: string
  getCitationBlockId: () => string | null
  getCitationBlockIdFromTool: () => string | null
}

export const createTextCallbacks = (deps: TextCallbacksDependencies) => {
  const { blockManager, assistantMsgId, getCitationBlockId, getCitationBlockIdFromTool } = deps

  // 内部维护的状态
  let mainTextBlockId: string | null = null

  return {
    getCurrentMainTextBlockId: () => mainTextBlockId,
    onTextStart: async () => {
      if (blockManager.hasInitialPlaceholder) {
        const changes = {
          type: MessageBlockType.MAIN_TEXT,
          content: '',
          status: MessageBlockStatus.STREAMING
        }
        mainTextBlockId = blockManager.initialPlaceholderBlockId!
        blockManager.smartBlockUpdate(mainTextBlockId, changes, MessageBlockType.MAIN_TEXT, true)
      } else if (!mainTextBlockId) {
        const newBlock = createMainTextBlock(assistantMsgId, '', {
          status: MessageBlockStatus.STREAMING
        })
        mainTextBlockId = newBlock.id
        await blockManager.handleBlockTransition(newBlock, MessageBlockType.MAIN_TEXT)
      }
    },

    onTextChunk: async (text: string) => {
      const citationBlockId = getCitationBlockId() || getCitationBlockIdFromTool()
      // Get citation block from StreamingService to determine source
      const citationBlock = citationBlockId
        ? (streamingService.getBlock(citationBlockId) as CitationMessageBlock | null)
        : null
      const citationBlockSource = citationBlock?.response?.source ?? WebSearchSource.WEBSEARCH

      if (text) {
        const blockChanges: Partial<MessageBlock> = {
          content: text,
          status: MessageBlockStatus.STREAMING,
          citationReferences: citationBlockId ? [{ citationBlockId, citationBlockSource }] : []
        }
        blockManager.smartBlockUpdate(mainTextBlockId!, blockChanges, MessageBlockType.MAIN_TEXT)
      }
    },

    onTextComplete: async (finalText: string) => {
      if (mainTextBlockId) {
        const changes = {
          content: finalText,
          status: MessageBlockStatus.SUCCESS
        }
        blockManager.smartBlockUpdate(mainTextBlockId, changes, MessageBlockType.MAIN_TEXT, true)
        mainTextBlockId = null
      } else {
        logger.warn(
          `[onTextComplete] Received text.complete but last block was not MAIN_TEXT (was ${blockManager.lastBlockType}) or lastBlockId is null.`
        )
      }
    }
  }
}
