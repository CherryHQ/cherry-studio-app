import type { ReactNode } from 'react'
import React from 'react'
import { View } from 'react-native'

interface MarkdownTableProps {
  children: ReactNode
}

export function MarkdownTable({ children }: MarkdownTableProps) {
  return <View className="border-border my-4 rounded-md border">{children}</View>
}
