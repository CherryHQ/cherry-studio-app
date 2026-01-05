import type { FC } from 'react'
import React, { memo } from 'react'

import type { Message, MessageBlock } from '@/types/message'

import MessageContent from './MessageContent'

interface MessageItemProps {
  message: Message
  messageBlocks: Record<string, MessageBlock[]>
}

const MessageItem: FC<MessageItemProps> = ({ message, messageBlocks }) => {
  const blocks = messageBlocks[message.id] || []
  return <MessageContent message={message} blocks={blocks} />
}

export default memo(MessageItem)
