import React from 'react'
import { Text } from 'react-native'

interface NitroCodeInlineProps {
  content: string
}

export function NitroCodeInline({ content }: NitroCodeInlineProps) {
  return <Text className="bg-neutral-200/40 font-mono text-sm text-amber-500">{content}</Text>
}
