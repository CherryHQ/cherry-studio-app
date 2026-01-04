import type { ReactNode } from 'react'
import React from 'react'
import { Text, View } from 'react-native'

interface NitroTaskListItemProps {
  checked?: boolean
  children: ReactNode
}

export function NitroTaskListItem({ checked, children }: NitroTaskListItemProps) {
  return (
    <View className="flex-row">
      <Text className="text-foreground mr-2">{checked ? '☑' : '☐'}</Text>
      <View className="flex-1">{children}</View>
    </View>
  )
}
