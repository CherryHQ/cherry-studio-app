import type { ReactNode } from 'react'
import React from 'react'
import { Text, View } from 'react-native'

interface MarkdownTableCellProps {
  isHeader?: boolean
  children: ReactNode
}

export function MarkdownTableCell({ isHeader, children }: MarkdownTableCellProps) {
  return (
    <View className="flex-1 p-2">
      <Text className={isHeader ? 'text-foreground font-bold' : 'text-foreground'}>{children}</Text>
    </View>
  )
}
