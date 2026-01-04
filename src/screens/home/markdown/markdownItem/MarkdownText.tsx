import React from 'react'
import { Text } from 'react-native'

interface MarkdownTextProps {
  content: string
}

export function MarkdownText({ content }: MarkdownTextProps) {
  return <Text>{content}</Text>
}
