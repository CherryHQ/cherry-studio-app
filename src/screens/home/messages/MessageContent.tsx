import React from 'react'
import { View } from 'react-native'
import { YStack } from '@/componentsV2'

import { Assistant } from '@/types/assistant'
import { Message, MessageBlock, MessageBlockType } from '@/types/message'

import MessageBlockRenderer from './blocks'
import MessageContextMenu from './MessageContextMenu'

interface Props {
  message: Message
  assistant?: Assistant
  isMultiModel?: boolean
  blocks: MessageBlock[]
}

const MessageContent: React.FC<Props> = ({ message, assistant, isMultiModel = false, blocks = [] }) => {
  const isUser = message.role === 'user'

  const mediaBlocks = blocks.filter(
    block => block.type === MessageBlockType.IMAGE || block.type === MessageBlockType.FILE
  )
  const contentBlocks = blocks.filter(
    block => block.type !== MessageBlockType.IMAGE && block.type !== MessageBlockType.FILE
  )

  if (isUser)
    return (
      <View className="w-full max-w-full flex-1 items-end rounded-2xl px-[14px]">
        {mediaBlocks.length > 0 && <MessageBlockRenderer blocks={mediaBlocks} message={message} />}
        {mediaBlocks.length > 0 && <View className="h-2" />}
        <MessageContextMenu message={message} assistant={assistant}>
          {contentBlocks.length > 0 && (
            <YStack className="rounded-l-xl rounded-br-sm rounded-tr-xl border border-green-20 bg-green-10 px-5 dark:border-green-dark-20 dark:bg-green-dark-10 ">
              <MessageBlockRenderer blocks={contentBlocks} message={message} />
            </YStack>
          )}
        </MessageContextMenu>
      </View>
    )

  return (
    <View className="flex-1">
      {/*使用expo/ui的contextmenu存在bug，当滑动messages时会偏移，zeego由于上游问题暂时没有迁移到expo 54*/}
      <MessageContextMenu message={message} assistant={assistant} isMultiModel={isMultiModel}>
        <View className="w-full max-w-full flex-1 rounded-2xl px-[14px]">
          {mediaBlocks.length > 0 && <MessageBlockRenderer blocks={mediaBlocks} message={message} />}
          {contentBlocks.length > 0 && (
            <YStack
              className={`w-full  max-w-full rounded-2xl bg-transparent px-0 ${mediaBlocks.length > 0 ? 'mt-2' : ''}`}>
              <MessageBlockRenderer blocks={contentBlocks} message={message} />
            </YStack>
          )}
        </View>
      </MessageContextMenu>
    </View>
  )
}

export default React.memo(MessageContent)
