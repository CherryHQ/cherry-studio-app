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
      <View className="mr-2 mt-1 items-center justify-center">
        {checked ? (
          <SquareCheck size={22} className="text-foreground" />
        ) : (
          <Square size={22} className="text-foreground" />
        )}
      </View>
      <View className="flex-1">{children}</View>
    </View>
  )
}
