import type { ReactNode } from 'react'
import React from 'react'
import { Text } from 'react-native'

interface MarkdownBoldProps {
  children: ReactNode
}

export function MarkdownBold({ children }: MarkdownBoldProps) {
  return <Text className="text-foreground font-bold">{children}</Text>
}
