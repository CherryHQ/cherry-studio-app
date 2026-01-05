import { cn } from 'heroui-native'
import type { ReactNode } from 'react'
import React from 'react'
import { View } from 'react-native'

import { Square, SquareCheck } from '@/componentsV2/icons/LucideIcon'
import { isIOS } from '@/utils/device'

interface MarkdownTaskListItemProps {
  checked?: boolean
  children: ReactNode
}

export function MarkdownTaskListItem({ checked, children }: MarkdownTaskListItemProps) {
  return (
    <View className="flex-row items-start">
      <View className={cn('mr-2 items-center justify-center', isIOS ? 'mt-1' : undefined)}>
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
