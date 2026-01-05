import type { ReactNode } from 'react'
import React from 'react'

import { StyledUITextView } from './MarkdownText'

interface MarkdownItalicProps {
  children: ReactNode
}

export function MarkdownItalic({ children }: MarkdownItalicProps) {
  return <StyledUITextView className="text-foreground italic">{children}</StyledUITextView>
}
