import type { ReactNode } from 'react'
import React from 'react'
import type { StyleProp, TextStyle } from 'react-native'

import { StyledUITextView } from './MarkdownText'

interface MarkdownBoldProps {
  children: ReactNode
  className?: string
  style?: StyleProp<TextStyle>
}

export function MarkdownBold({ children, className, style }: MarkdownBoldProps) {
  const mergedClassName = ['text-foreground', 'font-bold', className].filter(Boolean).join(' ')
  return (
    <StyledUITextView className={mergedClassName} style={style}>
      {children}
    </StyledUITextView>
  )
}
