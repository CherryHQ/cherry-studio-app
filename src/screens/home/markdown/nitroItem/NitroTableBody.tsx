import type { ReactNode } from 'react'
import React from 'react'
import { View } from 'react-native'

interface NitroTableBodyProps {
  children: ReactNode
}

export function NitroTableBody({ children }: NitroTableBodyProps) {
  return <View>{children}</View>
}
