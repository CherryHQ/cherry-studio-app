import React from 'react'
import { View } from 'react-native'

import { YStack } from '@/componentsV2'
import type { Message, MessageBlock } from '@/types/message'
import { MessageBlockType } from '@/types/message'

import MessageBlockRenderer from './blocks'

interface Props {
  message: Message
  blocks: MessageBlock[]
}

const MessageContent: React.FC<Props> = ({ message, blocks = [] }) => {
  const isUser = message.role === 'user'

  const mediaBlocks = blocks.filter(
    block => block.type === MessageBlockType.IMAGE || block.type === MessageBlockType.FILE
  )
  const contentBlocks = blocks.filter(
    block => block.type !== MessageBlockType.IMAGE && block.type !== MessageBlockType.FILE
  )

  if (isUser)
    return (
      // item-end 会导致android端消息框重叠
      <View className="w-full max-w-full flex-1 rounded-2xl px-3.5">
        {mediaBlocks.length > 0 && <MessageBlockRenderer blocks={mediaBlocks} message={message} />}
        {mediaBlocks.length > 0 && <View className="h-2" />}
        <View className="flex-row justify-end">
          {contentBlocks.length > 0 && (
            <YStack className="secondary-container rounded-l-xl rounded-br-sm rounded-tr-xl border px-5 pb-2 pt-1">
              <MessageBlockRenderer blocks={contentBlocks} message={message} />
            </YStack>
          )}
        </View>
      </View>
    )

  return (
    <View className="flex-1">
      <View className="w-full max-w-full flex-1 rounded-2xl px-3.5">
        {mediaBlocks.length > 0 && <MessageBlockRenderer blocks={mediaBlocks} message={message} />}
        {contentBlocks.length > 0 && (
          <YStack
            className={`w-full  max-w-full rounded-2xl bg-transparent px-0 ${mediaBlocks.length > 0 ? 'mt-2' : ''}`}>
            <MessageBlockRenderer blocks={contentBlocks} message={message} />
          </YStack>
        )}
      </View>
    </View>
  )
}

export default React.memo(MessageContent)
