import React from 'react'
import { Text } from 'react-native'

interface NitroMathInlineProps {
  content: string
}

export function NitroMathInline({ content }: NitroMathInlineProps) {
  return <Text className="text-foreground font-mono">{content}</Text>
}
