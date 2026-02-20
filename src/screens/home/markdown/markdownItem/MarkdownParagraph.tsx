import type { ReactNode } from 'react'
import React from 'react'
import { Text } from 'react-native'

interface MarkdownParagraphProps {
  children: ReactNode
  className?: string
  style
}

export function MarkdownParagraph({ children, className, style }: MarkdownParagraphProps) {
  const mergedClassName = ['text-foreground text-base', className].filter(Boolean).join(' ')
  return (
    <Text className={mergedClassName} style={style}>
      {children}
      {'\n'}
    </Text>
  )
}
