import type { ReactNode } from 'react'
import React from 'react'
import { View } from 'react-native'

interface MarkdownBlockquoteProps {
  children: ReactNode
}

export function MarkdownBlockquote({ children }: MarkdownBlockquoteProps) {
  return <View className="border-l-4 border-muted pl-4">{children}</View>
}
