import type { ReactNode } from 'react'
import React from 'react'
import { Text } from 'react-native'

interface MarkdownParagraphProps {
  children: ReactNode
}

export function MarkdownParagraph({ children }: MarkdownParagraphProps) {
  return <Text className="text-foreground text-base leading-relaxed">{children}</Text>
}
