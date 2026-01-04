import type { ReactNode } from 'react'
import React from 'react'
import { View } from 'react-native'

interface NitroTableHeadProps {
  children: ReactNode
}

export function NitroTableHead({ children }: NitroTableHeadProps) {
  return <View className="bg-muted">{children}</View>
}
