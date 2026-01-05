import type { ReactNode } from 'react'
import React from 'react'
import { Text, View } from 'react-native'

interface MarkdownListItemProps {
  children: ReactNode
  marker?: string
}

export function MarkdownListItem({ children, marker = '•' }: MarkdownListItemProps) {
  return (
    <View className="mb-1.5 flex-row items-start">
      <Text className="text-foreground mr-2 text-base">{marker}</Text>
      <View className="flex-1">{children}</View>
    </View>
  )
}
