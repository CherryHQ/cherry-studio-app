import type { ReactNode } from 'react'
import React from 'react'
import type { StyleProp, TextStyle } from 'react-native'

import { StyledUITextView } from './MarkdownText'

interface MarkdownStrikethroughProps {
  children: ReactNode
  className?: string
  style?: StyleProp<TextStyle>
}

export function MarkdownStrikethrough({ children, className, style }: MarkdownStrikethroughProps) {
  const mergedClassName = ['text-foreground', 'line-through', className].filter(Boolean).join(' ')
  return (
    <StyledUITextView className={mergedClassName} style={style}>
      {children}
    </StyledUITextView>
  )
}
