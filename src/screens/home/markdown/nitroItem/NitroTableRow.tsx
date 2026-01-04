import type { ReactNode } from 'react'
import React from 'react'
import { View } from 'react-native'

interface NitroTableRowProps {
  children: ReactNode
}

export function NitroTableRow({ children }: NitroTableRowProps) {
  return <View className="flex-row border-b border-border">{children}</View>
}
