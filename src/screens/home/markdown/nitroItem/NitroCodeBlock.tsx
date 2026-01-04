import React from 'react'
import { Text, View } from 'react-native'

interface NitroCodeBlockProps {
  content: string
  language?: string
}

export function NitroCodeBlock({ content }: NitroCodeBlockProps) {
  return (
    <View className="rounded-md p-3">
      <Text className="text-foreground font-mono">{content}</Text>
    </View>
  )
}
