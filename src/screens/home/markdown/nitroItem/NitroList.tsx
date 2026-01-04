import type { ReactNode } from 'react'
import React from 'react'
import { View } from 'react-native'

interface NitroListProps {
  ordered?: boolean
  children: ReactNode
}

export function NitroList({ children }: NitroListProps) {
  return <View className="my-2">{children}</View>
}
