import React from 'react'
import type { StyleProp, TextStyle } from 'react-native'
import { Text } from 'react-native'
import { withUniwind } from 'uniwind'

export const StyledText = withUniwind(Text)

interface MarkdownTextProps {
  content: string
  className?: string
  style?: StyleProp<TextStyle>
}

export function MarkdownText({ content, className, style }: MarkdownTextProps) {
  return (
    <StyledText className={className} style={style}>
      {content}
    </StyledText>
  )
}
