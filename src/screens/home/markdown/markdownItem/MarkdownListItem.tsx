import type { ReactNode } from 'react'
import React from 'react'
import { Text, View } from 'react-native'

interface MarkdownListItemProps {
  children: ReactNode
}

export function MarkdownListItem({ children }: MarkdownListItemProps) {
  return (
    <View className="flex-row">
      <Text className="text-foreground mr-2">•</Text>
      <View className="flex-1">{children}</View>
    </View>
  )
}
