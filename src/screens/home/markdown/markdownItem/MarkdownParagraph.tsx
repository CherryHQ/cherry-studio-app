import type { ReactNode } from 'react'
import React from 'react'

import { SelectableText } from './SelectableText'

interface MarkdownParagraphProps {
  children: ReactNode
}

export function MarkdownParagraph({ children }: MarkdownParagraphProps) {
  return <SelectableText className="text-foreground text-base leading-relaxed">{children}</SelectableText>
}
