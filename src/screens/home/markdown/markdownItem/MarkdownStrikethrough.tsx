import type { ReactNode } from 'react'
import React from 'react'

import { StyledUITextView } from './MarkdownText'

interface MarkdownStrikethroughProps {
  children: ReactNode
}

export function MarkdownStrikethrough({ children }: MarkdownStrikethroughProps) {
  return <StyledUITextView className="text-foreground line-through">{children}</StyledUITextView>
}
