import type { ReactNode } from 'react'
import React from 'react'
import { View } from 'react-native'

interface MarkdownTableRowProps {
  children: ReactNode
}

export function MarkdownTableRow({ children }: MarkdownTableRowProps) {
  return <View className="flex-row border-b border-border">{children}</View>
}
