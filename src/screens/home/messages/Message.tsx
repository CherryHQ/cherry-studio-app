import type { FC } from 'react'
import React, { memo } from 'react'

import type { Message, MessageBlock } from '@/types/message'

import MessageContent from './MessageContent'

interface MessageItemProps {
  message: Message
  messageBlocks: Record<string, MessageBlock[]>
  excludeThinking?: boolean
}

const MessageItem: FC<MessageItemProps> = ({ message, messageBlocks, excludeThinking = false }) => {
  const blocks = messageBlocks[message.id] || []
  return <MessageContent message={message} blocks={blocks} excludeThinking={excludeThinking} />
}

export default memo(MessageItem)
