import type { ReactNode } from 'react'
import React from 'react'
import type { StyleProp, TextStyle } from 'react-native'

import { StyledUITextView } from './MarkdownText'

interface MarkdownItalicProps {
  children: ReactNode
  className?: string
  style?: StyleProp<TextStyle>
}

export function MarkdownItalic({ children, className, style }: MarkdownItalicProps) {
  const mergedClassName = ['text-foreground', 'italic', className].filter(Boolean).join(' ')
  return (
    <StyledUITextView className={mergedClassName} style={style}>
      {children}
    </StyledUITextView>
  )
}
