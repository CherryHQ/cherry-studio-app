import React from 'react'
import { Text } from 'react-native'

interface MarkdownCodeInlineProps {
  content: string
}

export function MarkdownCodeInline({ content }: MarkdownCodeInlineProps) {
  return (
    <Text style={{ fontFamily: 'FiraCode' }} className="text-md bg-neutral-200/40 text-amber-500 dark:bg-neutral-800">
      {content}
    </Text>
  )
}
