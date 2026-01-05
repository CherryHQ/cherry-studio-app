import type { ReactNode } from 'react'
import React from 'react'

import { StyledUITextView } from './MarkdownText'

interface MarkdownBoldProps {
  children: ReactNode
}

export function MarkdownBold({ children }: MarkdownBoldProps) {
  return <StyledUITextView className="text-foreground font-bold">{children}</StyledUITextView>
}
