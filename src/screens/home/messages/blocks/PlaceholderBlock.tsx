import { MotiView } from 'moti'
import React from 'react'
import { View } from 'react-native'

import type { PlaceholderMessageBlock } from '@/types/message'
import { MessageBlockStatus, MessageBlockType } from '@/types/message'

interface PlaceholderBlockProps {
  block: PlaceholderMessageBlock
}

const TypingLoader: React.FC = () => {
  return (
    <View
      className="flex-row items-center"
      style={{ height: 20 }}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading">
      {Array.from({ length: 3 }).map((_, index) => (
        <MotiView
          key={index}
          from={{ opacity: 0.4, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            type: 'timing',
            duration: 600,
            delay: index * 150,
            loop: true,
            repeatReverse: true
          }}
          className="bg-text-primary rounded-full"
          style={{
            width: 6,
            height: 6,
            marginLeft: index === 0 ? 0 : 4
          }}
        />
      ))}
    </View>
  )
}

const PlaceholderBlock: React.FC<PlaceholderBlockProps> = ({ block }) => {
  if (block.status === MessageBlockStatus.PROCESSING && block.type === MessageBlockType.UNKNOWN) {
    return (
      <View className="my-2.5 flex-1 items-start">
        <TypingLoader />
      </View>
    )
  }
}

export default React.memo(PlaceholderBlock)
