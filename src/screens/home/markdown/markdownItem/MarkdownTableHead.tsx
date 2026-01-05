import type { ReactNode } from 'react'
import React from 'react'
import { View } from 'react-native'

interface MarkdownTableHeadProps {
  children: ReactNode
}

export function MarkdownTableHead({ children }: MarkdownTableHeadProps) {
  return <View className="bg-muted">{children}</View>
}
