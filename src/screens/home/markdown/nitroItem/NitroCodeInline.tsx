import React from 'react'
import { Text } from 'react-native'

interface NitroCodeInlineProps {
  content: string
}

export function NitroCodeInline({ content }: NitroCodeInlineProps) {
  return <Text className="text-foreground font-mono">{content}</Text>
}
