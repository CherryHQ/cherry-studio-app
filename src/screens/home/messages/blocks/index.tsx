import type { FC } from 'react'
import React, { memo, useMemo } from 'react'
import { View } from 'react-native'

import { XStack } from '@/componentsV2'
import { loggerService } from '@/services/LoggerService'
import type { CitationMessageBlock, MainTextMessageBlock, Message, MessageBlock } from '@/types/message'
import { MessageBlockStatus, MessageBlockType } from '@/types/message'

import CitationBlock from './CitationBlock'
import ErrorBlock from './ErrorBlock'
import FileBlock from './FileBlock'
import ImageBlock from './ImageBlock'
import MainTextBlock from './MainTextBlock'
import PlaceholderBlock from './PlaceholderBlock'
import ThinkingBlock from './ThinkingBlock'
import ToolBlock from './ToolBlock'
import TranslationBlock from './TranslationBlock'
const logger = loggerService.withContext('Message Blocks Index')

interface MessageBlockRendererProps {
  blocks: MessageBlock[] // 可以接收块ID数组或MessageBlock数组
  messageStatus?: Message['status']
  message: Message
}

/**
 * Pre-processes message blocks for rendering.
 * 1. Separates citation blocks to be rendered at the end.
 * 2. Groups consecutive media blocks (IMAGE, FILE) together.
 * @param blocks The source message blocks.
 * @returns An object containing content blocks (with media grouped) and citation blocks.
 */
const prepareBlocksForRender = (blocks: MessageBlock[]) => {
  const citationBlocks: CitationMessageBlock[] = []
  const otherBlocks: MessageBlock[] = []

  for (const block of blocks) {
    if (block.type === MessageBlockType.CITATION) {
      citationBlocks.push(block)
    } else {
      otherBlocks.push(block)
    }
  }

  const contentBlocks = otherBlocks.reduce((acc: (MessageBlock[] | MessageBlock)[], currentBlock) => {
    if (currentBlock.type === MessageBlockType.IMAGE || currentBlock.type === MessageBlockType.FILE) {
      const prevGroup = acc[acc.length - 1]

      if (Array.isArray(prevGroup) && prevGroup[0]?.type === currentBlock.type) {
        prevGroup.push(currentBlock)
      } else {
        acc.push([currentBlock])
      }
    } else {
      acc.push(currentBlock)
    }

    return acc
  }, [])
  return { contentBlocks, citationBlocks }
}

const MessageBlockRenderer: FC<MessageBlockRendererProps> = ({ blocks, message }) => {
  const { contentBlocks, citationBlocks } = useMemo(() => prepareBlocksForRender(blocks), [blocks])
  return (
    <View className="gap-2">
      {contentBlocks.map(blockOrGroup => {
        if (Array.isArray(blockOrGroup)) {
          const groupKey = blockOrGroup[0]?.id || 'media-group'
          return (
            <XStack
              key={groupKey}
              className={`mt-2.5 flex-wrap gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {blockOrGroup.map(block => {
                switch (block.type) {
                  case MessageBlockType.IMAGE:
                    return <ImageBlock key={block.id} block={block} />
                  case MessageBlockType.FILE:
                    return <FileBlock key={block.id} block={block} />
                  default:
                    return null
                }
              })}
            </XStack>
          )
        }

        const block = blockOrGroup
        let blockComponent: React.ReactNode = null

        switch (block.type) {
          case MessageBlockType.UNKNOWN:
            if (block.status === MessageBlockStatus.PROCESSING) {
              blockComponent = <PlaceholderBlock key={block.id} block={block} />
            }

            break
          case MessageBlockType.MAIN_TEXT:
          case MessageBlockType.CODE: {
            const mainTextBlock = block as MainTextMessageBlock
            const citationBlockId = mainTextBlock.citationReferences?.[0]?.citationBlockId
            blockComponent = <MainTextBlock key={block.id} block={mainTextBlock} citationBlockId={citationBlockId} />
            break
          }

          case MessageBlockType.IMAGE:
            blockComponent = <ImageBlock key={block.id} block={block} />
            break
          case MessageBlockType.FILE:
            blockComponent = <FileBlock key={block.id} block={block} />
            break
          case MessageBlockType.THINKING:
            blockComponent = <ThinkingBlock key={block.id} block={block} />
            break
          case MessageBlockType.TRANSLATION:
            blockComponent = <TranslationBlock key={block.id} block={block} />
            break
          case MessageBlockType.TOOL:
            blockComponent = <ToolBlock key={block.id} block={block} />
            break
          case MessageBlockType.ERROR:
            blockComponent = <ErrorBlock key={block.id} block={block} message={message} />
            break
          default:
            logger.warn('Unsupported block type in MessageBlockRenderer:', (block as any).type, block)
            break
        }

        return <View key={block.type === MessageBlockType.UNKNOWN ? 'placeholder' : block.id}>{blockComponent}</View>
      })}
      {citationBlocks.map(block => (
        <CitationBlock key={block.id} block={block} />
      ))}
    </View>
  )
}

export default memo(MessageBlockRenderer)
