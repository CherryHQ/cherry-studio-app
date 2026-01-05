import type { ReactNode } from 'react'
import React from 'react'
import { View } from 'react-native'

interface MarkdownListProps {
  ordered?: boolean
  children: ReactNode
}

export function MarkdownList({ children }: MarkdownListProps) {
  return <View className="my-2">{children}</View>
}
