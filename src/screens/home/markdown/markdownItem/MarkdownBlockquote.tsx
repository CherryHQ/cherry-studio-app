import type { ReactNode } from 'react'
import React from 'react'
import { View } from 'react-native'

interface MarkdownBlockquoteProps {
  children: ReactNode
}

export function MarkdownBlockquote({ children }: MarkdownBlockquoteProps) {
  return <View className="border-muted border-l-4 pl-4">{children}</View>
}
