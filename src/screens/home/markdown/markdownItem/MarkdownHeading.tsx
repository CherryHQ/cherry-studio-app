import type { ReactNode } from 'react'
import React from 'react'

import { SelectableText } from './SelectableText'

interface MarkdownHeadingProps {
  level: 1 | 2 | 3 | 4 | 5 | 6
  children: ReactNode
}

export const headingClasses: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: 'text-foreground text-3xl font-bold',
  2: 'text-foreground text-2xl font-bold',
  3: 'text-foreground text-xl font-bold',
  4: 'text-foreground text-lg font-bold',
  5: 'text-foreground text-base font-bold',
  6: 'text-foreground text-base font-bold'
}

export function MarkdownHeading({ level, children }: MarkdownHeadingProps) {
  return <SelectableText className={headingClasses[level]}>{children}</SelectableText>
}
