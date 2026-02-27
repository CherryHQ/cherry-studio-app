import type { ReactNode } from 'react'
import React from 'react'
import { View } from 'react-native'

import { SelectableText } from './SelectableText'

interface MarkdownHeadingProps {
  level: 1 | 2 | 3 | 4 | 5 | 6
  children: ReactNode
}

export const headingClasses: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: 'text-foreground text-3xl font-bold my-3',
  2: 'text-foreground text-2xl font-bold my-3',
  3: 'text-foreground text-xl font-bold my-3',
  4: 'text-foreground text-lg font-bold my-3',
  5: 'text-foreground text-base font-bold my-3',
  6: 'text-foreground text-base font-bold my-3'
}

export function MarkdownHeading({ level, children }: MarkdownHeadingProps) {
  return (
    <>
      <SelectableText className={headingClasses[level]}>{children}</SelectableText>
      {[1, 2].includes(level) && <View className="my-3 h-px bg-[#e6e6e6]" />}
    </>
  )
}
