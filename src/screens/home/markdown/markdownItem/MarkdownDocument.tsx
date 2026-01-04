import type { ReactNode } from 'react'
import React from 'react'
import { View } from 'react-native'

interface MarkdownDocumentProps {
  children: ReactNode
}

export function MarkdownDocument({ children }: MarkdownDocumentProps) {
  return <View>{children}</View>
}
