import { FC, memo } from 'react'
import React from 'react'
import { View, XStack } from 'tamagui'

import { MainTextMessageBlock, MessageBlock, MessageBlockStatus, MessageBlockType } from '@/types/message'

import FileBlock from './FileBlock'
import ImageBlock from './ImageBlock'
import MainTextBlock from './MainTextBlock'
import PlaceholderBlock from './PlaceholderBlock'
import ThinkingBlock from './ThinkingBlock'
import TranslationBlock from './TranslationBlock'

interface MessageBlockRendererProps {
  blocks: MessageBlock[]
}

/**
 * Groups media blocks (images and files or Videos/Audio(later)) in the message.
 * @param blocks The message blocks to group.
 * @returns An array of grouped media blocks.
 */
const filterMediaBlockGroups = (blocks: MessageBlock[]): (MessageBlock[] | MessageBlock)[] => {
  return blocks.reduce((acc: (MessageBlock[] | MessageBlock)[], currentBlock) => {
    if (currentBlock.type === MessageBlockType.IMAGE || currentBlock.type === MessageBlockType.FILE) {
      const prevGroup = acc[acc.length - 1]

      if (Array.isArray(prevGroup) && prevGroup[0].type === currentBlock.type) {
        prevGroup.push(currentBlock)
      } else {
        acc.push([currentBlock])
      }
    } else {
      acc.push(currentBlock)
    }

    return acc
  }, [])
}

const MessageBlockRenderer: FC<MessageBlockRendererProps> = ({ blocks }) => {
  const groupedBlocks = filterMediaBlockGroups(blocks)

  return (
    <View flex={1} width="100%">
      {groupedBlocks.map(block => {
        if (Array.isArray(block)) {
          const groupKey = blocks.map(block => block.id).join('-')
          return (
            <View key={groupKey} width="100%">
              <XStack flexWrap="wrap" gap="5" width="100%">
                {blocks.map(block => {
                  switch (block.type) {
                    case MessageBlockType.IMAGE:
                      return <ImageBlock key={block.id} block={block} />
                    case MessageBlockType.FILE:
                      return <FileBlock key={block.id} block={block} />
                  }
                })}
              </XStack>
            </View>
          )
        }

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
            blockComponent = (
              <MainTextBlock
                key={block.id}
                block={mainTextBlock}
                // Pass only the ID string
                citationBlockId={citationBlockId}
              />
            )
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
          default:
            console.warn('Unsupported block type in MessageBlockRenderer:', (block as any).type, block)
            break
        }

        return <View key={block.type === MessageBlockType.UNKNOWN ? 'placeholder' : block.id}>{blockComponent}</View>
      })}
    </View>
  )
}

export default memo(MessageBlockRenderer)
