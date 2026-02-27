import React from 'react'

import { StyledText } from './MarkdownText'

interface MarkdownCodeInlineProps {
  content: string
}

export function MarkdownCodeInline({ content }: MarkdownCodeInlineProps) {
  return (
    <StyledText style={{ fontFamily: 'FiraCode' }} className="text-md bg-neutral-200/40  dark:bg-neutral-800">
      {content}
    </StyledText>
  )
}
