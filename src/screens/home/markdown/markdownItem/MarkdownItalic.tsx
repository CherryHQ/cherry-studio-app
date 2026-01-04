import type { ReactNode } from 'react'
import React from 'react'
import { Text } from 'react-native'

interface MarkdownItalicProps {
  children: ReactNode
}

export function MarkdownItalic({ children }: MarkdownItalicProps) {
  return <Text className="text-foreground italic">{children}</Text>
}
