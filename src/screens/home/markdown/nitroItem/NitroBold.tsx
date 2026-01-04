import type { ReactNode } from 'react'
import React from 'react'
import { Text } from 'react-native'

interface NitroBoldProps {
  children: ReactNode
}

export function NitroBold({ children }: NitroBoldProps) {
  return <Text className="text-foreground font-bold">{children}</Text>
}
