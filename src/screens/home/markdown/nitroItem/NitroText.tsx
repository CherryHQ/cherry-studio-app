import React from 'react'
import { Text } from 'react-native'

interface NitroTextProps {
  content: string
}

export function NitroText({ content }: NitroTextProps) {
  return <Text className="text-foreground">{content}</Text>
}
