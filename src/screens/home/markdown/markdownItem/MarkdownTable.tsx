import type { ReactNode } from 'react'
import React from 'react'
import { ScrollView, View } from 'react-native'

interface MarkdownTableProps {
  children: ReactNode
}
export function MarkdownTable({ children }: MarkdownTableProps) {
  return (
    <ScrollView horizontal={true} showsHorizontalScrollIndicator={true}>
      <View className="border-border my-4 rounded-md border">{children}</View>
    </ScrollView>
  )
}
