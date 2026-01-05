import React from 'react'

import { StyledUITextView } from './MarkdownText'

interface MarkdownCodeInlineProps {
  content: string
}

export function MarkdownCodeInline({ content }: MarkdownCodeInlineProps) {
  return (
    <StyledUITextView
      style={{ fontFamily: 'FiraCode' }}
      className="text-md bg-neutral-200/40 text-amber-500 dark:bg-neutral-800">
      {content}
    </StyledUITextView>
  )
}
