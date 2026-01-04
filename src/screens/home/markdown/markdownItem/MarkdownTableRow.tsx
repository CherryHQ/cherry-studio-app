import type { ReactNode } from 'react'
import React from 'react'
import { View } from 'react-native'

interface MarkdownTableRowProps {
  children: ReactNode
}

export function MarkdownTableRow({ children }: MarkdownTableRowProps) {
  return <View className="border-border flex-row border-b">{children}</View>
}
