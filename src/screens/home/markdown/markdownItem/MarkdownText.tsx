import React from 'react'
import type { StyleProp, TextStyle } from 'react-native'
import { UITextView } from 'react-native-uitextview'
import { withUniwind } from 'uniwind'

export const StyledUITextView = withUniwind(UITextView)

interface MarkdownTextProps {
  content: string
  className?: string
  style?: StyleProp<TextStyle>
}

export function MarkdownText({ content, className, style }: MarkdownTextProps) {
  return (
    <StyledUITextView className={className} style={style}>
      {content}
    </StyledUITextView>
  )
}
