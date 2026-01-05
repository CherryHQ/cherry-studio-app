import type { ReactNode } from 'react'
import React from 'react'

import { StyledUITextView } from './MarkdownText'

interface MarkdownParagraphProps {
  children: ReactNode
}

export function MarkdownParagraph({ children }: MarkdownParagraphProps) {
  return (
    <StyledUITextView uiTextView selectable>
      {children}
    </StyledUITextView>
  )
}
