import { writeBase64File } from '@/services/FileService'
import { loggerService } from '@/services/LoggerService'
import type { ImageMessageBlock } from '@/types/message'
import { MessageBlockStatus, MessageBlockType } from '@/types/message'
import { createImageBlock } from '@/utils/messageUtils/create'

import type { BlockManager } from '../BlockManager'

const logger = loggerService.withContext('createImageCallbacks')

interface ImageCallbacksDependencies {
  blockManager: BlockManager
  assistantMsgId: string
}

export const createImageCallbacks = (deps: ImageCallbacksDependencies) => {
  const { blockManager, assistantMsgId } = deps

  // 内部维护的状态
  let imageBlockId: string | null = null

  return {
    onImageCreated: async () => {
      if (blockManager.hasInitialPlaceholder) {
        const initialChanges = {
          type: MessageBlockType.IMAGE,
          status: MessageBlockStatus.PENDING
        }
        imageBlockId = blockManager.initialPlaceholderBlockId!
        blockManager.smartBlockUpdate(imageBlockId, initialChanges, MessageBlockType.IMAGE)
      } else if (!imageBlockId) {
        const imageBlock = createImageBlock(assistantMsgId, {
          status: MessageBlockStatus.PENDING
        })
        imageBlockId = imageBlock.id
        await blockManager.handleBlockTransition(imageBlock, MessageBlockType.IMAGE)
      }
    },

    onImageDelta: (imageData: any) => {
      const imageUrl = imageData.images?.[0] || 'placeholder_image_url'

      if (imageBlockId) {
        const changes: Partial<ImageMessageBlock> = {
          url: imageUrl,
          metadata: { generateImageResponse: imageData },
          status: MessageBlockStatus.STREAMING
        }
        blockManager.smartBlockUpdate(imageBlockId, changes, MessageBlockType.IMAGE, true)
      }
    },
    // 将生成的图片处理成file类型，加快读取速度
    onImageGenerated: async (imageData: any) => {
      if (imageBlockId) {
        if (!imageData) {
          const changes: Partial<ImageMessageBlock> = {
            status: MessageBlockStatus.SUCCESS
          }
          blockManager.smartBlockUpdate(imageBlockId, changes, MessageBlockType.IMAGE)
        } else {
          const imageFile = await writeBase64File(imageData.images?.[0])
          const changes: Partial<ImageMessageBlock> = {
            file: imageFile,
            status: MessageBlockStatus.SUCCESS
          }
          blockManager.smartBlockUpdate(imageBlockId, changes, MessageBlockType.IMAGE, true)
        }

        imageBlockId = null
      } else {
        if (imageData) {
          const imageFile = await writeBase64File(imageData.images?.[0])
          const imageBlock = createImageBlock(assistantMsgId, {
            file: imageFile,
            status: MessageBlockStatus.SUCCESS
          })
          await blockManager.handleBlockTransition(imageBlock, MessageBlockType.IMAGE)
        } else {
          logger.error('[onImageGenerated] Last block was not an Image block or ID is missing.')
        }
      }
    }
  }
}
