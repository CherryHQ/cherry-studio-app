import React from 'react'
import { Text, View } from 'react-native'

interface NitroMathBlockProps {
  content: string
}

export function NitroMathBlock({ content }: NitroMathBlockProps) {
  return (
    <View className="my-4 items-center">
      <Text className="text-foreground font-mono">{content}</Text>
    </View>
  )
}
