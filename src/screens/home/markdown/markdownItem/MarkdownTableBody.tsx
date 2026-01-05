import type { ReactNode } from 'react'
import React from 'react'
import { View } from 'react-native'

interface MarkdownTableBodyProps {
  children: ReactNode
}

export function MarkdownTableBody({ children }: MarkdownTableBodyProps) {
  return <View>{children}</View>
}
