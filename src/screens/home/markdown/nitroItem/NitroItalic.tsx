import type { ReactNode } from 'react'
import React from 'react'
import { Text } from 'react-native'

interface NitroItalicProps {
  children: ReactNode
}

export function NitroItalic({ children }: NitroItalicProps) {
  return <Text className="text-foreground italic">{children}</Text>
}
