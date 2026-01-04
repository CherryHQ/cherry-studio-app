import type { ReactNode } from 'react'
import React from 'react'
import { View } from 'react-native'

interface NitroBlockquoteProps {
  children: ReactNode
}

export function NitroBlockquote({ children }: NitroBlockquoteProps) {
  return <View className="border-l-4 border-muted pl-4">{children}</View>
}
