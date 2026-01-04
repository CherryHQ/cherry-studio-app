import type { ReactNode } from 'react'
import React from 'react'
import { Text } from 'react-native'

interface NitroStrikethroughProps {
  children: ReactNode
}

export function NitroStrikethrough({ children }: NitroStrikethroughProps) {
  return <Text className="text-foreground line-through">{children}</Text>
}
