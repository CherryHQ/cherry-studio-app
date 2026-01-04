import type { ReactNode } from 'react'
import React from 'react'
import { View } from 'react-native'

interface NitroDocumentProps {
  children: ReactNode
}

export function NitroDocument({ children }: NitroDocumentProps) {
  return <View className="flex-1">{children}</View>
}
