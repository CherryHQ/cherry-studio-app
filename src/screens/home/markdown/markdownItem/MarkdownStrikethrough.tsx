import type { ReactNode } from 'react'
import React from 'react'
import { Text } from 'react-native'

interface MarkdownStrikethroughProps {
  children: ReactNode
}

export function MarkdownStrikethrough({ children }: MarkdownStrikethroughProps) {
  return <Text className="text-foreground line-through">{children}</Text>
}
