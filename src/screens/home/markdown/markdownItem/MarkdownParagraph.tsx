import type { ReactNode } from 'react'
import React from 'react'
import type { StyleProp, TextStyle } from 'react-native'

import { SelectableText } from './SelectableText'

interface MarkdownParagraphProps {
  children: ReactNode
  className?: string
  style?: StyleProp<TextStyle>
}

export function MarkdownParagraph({ children, className, style }: MarkdownParagraphProps) {
  const mergedClassName = ['text-foreground text-base', className].filter(Boolean).join(' ')
  return (
    <SelectableText className={mergedClassName} style={style}>
      {children}
    </SelectableText>
  )
}
