import type { ReactNode } from 'react'
import React from 'react'
import { View } from 'react-native'

import { SelectableText } from './SelectableText'

interface MarkdownTableCellProps {
  isHeader?: boolean
  children: ReactNode
}

export function MarkdownTableCell({ isHeader, children }: MarkdownTableCellProps) {
  return (
    <View className="flex-1 p-2">
      <SelectableText className={isHeader ? 'text-foreground font-bold' : 'text-foreground'}>{children}</SelectableText>
    </View>
  )
}
