import type { ReactNode } from 'react'
import React from 'react'
import { Text } from 'react-native'

interface NitroParagraphProps {
  children: ReactNode
}

export function NitroParagraph({ children }: NitroParagraphProps) {
  return <Text className="text-base text-foreground">{children}</Text>
}
