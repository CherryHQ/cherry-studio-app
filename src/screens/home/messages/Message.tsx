import type { FC } from 'react'
import React, { memo } from 'react'

import type { Assistant } from '@/types/assistant'
import type { Message, MessageBlock } from '@/types/message'

import MessageContent from './MessageContent'

interface MessageItemProps {
  message: Message
  assistant?: Assistant
  isMultiModel?: boolean
  messageBlocks: Record<string, MessageBlock[]>
}

const MessageItem: FC<MessageItemProps> = ({ message, assistant, isMultiModel = false, messageBlocks }) => {
  const blocks = messageBlocks[message.id] || []
  return <MessageContent message={message} assistant={assistant} isMultiModel={isMultiModel} blocks={blocks} />
}

export default memo(MessageItem)
