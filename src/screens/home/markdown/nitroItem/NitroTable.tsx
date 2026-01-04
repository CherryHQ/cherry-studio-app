import type { ReactNode } from 'react'
import React from 'react'
import { View } from 'react-native'

interface NitroTableProps {
  children: ReactNode
}

export function NitroTable({ children }: NitroTableProps) {
  return <View className="my-4 rounded-md border border-border">{children}</View>
}
