import type { ReactNode } from 'react'
import React from 'react'
import type { StyleProp, TextStyle } from 'react-native'

import { StyledText } from './MarkdownText'

interface MarkdownItalicProps {
  children: ReactNode
  className?: string
  style?: StyleProp<TextStyle>
}

export function MarkdownItalic({ children, className, style }: MarkdownItalicProps) {
  const mergedClassName = ['text-foreground', 'italic', 'my-3', className].filter(Boolean).join(' ')
  return (
    <StyledText className={mergedClassName} style={style}>
      {children}
    </StyledText>
  )
}
