import { messageBlockDatabase } from '@database'

import { loggerService } from '@/services/LoggerService'
import type { CitationMessageBlock, MessageBlock } from '@/types/message'
import { MessageBlockStatus, MessageBlockType } from '@/types/message'
import { WebSearchSource } from '@/types/websearch'
import { createMainTextBlock } from '@/utils/messageUtils/create'

import type { BlockManager } from '../BlockManager'

const logger = loggerService.withContext('Text Callbacks')

interface TextCallbacksDependencies {
  blockManager: BlockManager
  assistantMsgId: string
  getCitationBlockId: () => string | null
}

export const createTextCallbacks = (deps: TextCallbacksDependencies) => {
  const { blockManager, assistantMsgId, getCitationBlockId } = deps

  // 内部维护的状态
  let mainTextBlockId: string | null = null

  return {
    onTextStart: async () => {
      if (blockManager.hasInitialPlaceholder) {
        logger.debug('onTextStart hasInitialPlaceholder')
        const changes = {
          type: MessageBlockType.MAIN_TEXT,
          content: '',
          status: MessageBlockStatus.STREAMING
        }
        mainTextBlockId = blockManager.initialPlaceholderBlockId!
        blockManager.smartBlockUpdate(mainTextBlockId, changes, MessageBlockType.MAIN_TEXT, true)
        logger.debug('onTextStart', changes)
      } else if (!mainTextBlockId) {
        const newBlock = createMainTextBlock(assistantMsgId, '', {
          status: MessageBlockStatus.STREAMING
        })
        mainTextBlockId = newBlock.id
        await blockManager.handleBlockTransition(newBlock, MessageBlockType.MAIN_TEXT)
        logger.debug('onTextStart created new MAIN_TEXT block', mainTextBlockId)
      }
    },

    onTextChunk: async (text: string) => {
      const citationBlockId = getCitationBlockId()
      const citationBlockSource = citationBlockId
        ? ((await messageBlockDatabase.getBlockById(citationBlockId)) as CitationMessageBlock).response?.source
        : WebSearchSource.WEBSEARCH

      if (text) {
        const blockChanges: Partial<MessageBlock> = {
          content: text,
          status: MessageBlockStatus.STREAMING,
          citationReferences: citationBlockId ? [{ citationBlockId, citationBlockSource }] : []
        }
        blockManager.smartBlockUpdate(mainTextBlockId!, blockChanges, MessageBlockType.MAIN_TEXT)
        logger.info('onTextChunk', blockChanges)
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
        logger.debug('onTextComplete', changes)
      } else {
        logger.warn(
          `[onTextComplete] Received text.complete but last block was not MAIN_TEXT (was ${blockManager.lastBlockType}) or lastBlockId is null.`
        )
      }
    }
  }
}
