import type { ReactNode } from 'react'
import React from 'react'
import { View } from 'react-native'

import { Square, SquareCheck } from '@/componentsV2/icons/LucideIcon'

interface MarkdownTaskListItemProps {
  checked?: boolean
  children: ReactNode
}

export function MarkdownTaskListItem({ checked, children }: MarkdownTaskListItemProps) {
  return (
    <View className="flex-row items-start">
      <View className="mr-2">
        {checked ? (
          <SquareCheck size={18} className="text-foreground" />
        ) : (
          <Square size={18} className="text-foreground" />
        )}
      </View>
      <View className="flex-1">{children}</View>
    </View>
  )
}
