import { FlashList } from '@shopify/flash-list'
import { FC } from 'react'
import React from 'react'
import { View } from 'tamagui'

import { useMessages } from '@/hooks/useMessages'
import { Assistant, Topic } from '@/types/assistant'
import { GroupedMessage } from '@/types/message'
import { getGroupedMessages } from '@/utils/messageUtils/filters'

import MessageGroup from './MessageGroup'

interface MessagesProps {
  assistant: Assistant
  topic: Topic
  setActiveTopic?: (topic: Topic) => void
  onComponentUpdate?(): void
  onFirstUpdate?(): void
}

const Messages: FC<MessagesProps> = ({ assistant, topic, setActiveTopic, onComponentUpdate, onFirstUpdate }) => {
  const { messages } = useMessages(topic.id)
  const groupedMessages = Object.entries(getGroupedMessages(messages))

  const renderMessageGroup = ({ item }: { item: [string, GroupedMessage[]] }) => {
    return <MessageGroup assistant={assistant} item={item} />
  }

  return (
    <View style={{ flex: 1, minHeight: 200 }}>
      <FlashList
        data={groupedMessages}
        renderItem={renderMessageGroup}
        keyExtractor={([key, group]) => `${key}-${group[0]?.id}`}
        estimatedItemSize={100} // 估算值可能需要根据内容调整
      />
    </View>
  )
}

export default Messages
