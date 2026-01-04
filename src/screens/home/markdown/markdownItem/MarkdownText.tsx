import React from 'react'
import { UITextView } from 'react-native-uitextview'
import { withUniwind } from 'uniwind'

const StyledUITextView = withUniwind(UITextView)

interface MarkdownTextProps {
  content: string
  className?: string
}

export function MarkdownText({ content, className }: MarkdownTextProps) {
  return <StyledUITextView className={className}>{content}</StyledUITextView>
}
