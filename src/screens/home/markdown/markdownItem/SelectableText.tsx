import type { ReactNode } from 'react'
import React from 'react'
import { Platform, type TextProps } from 'react-native'
import { UITextView } from 'react-native-uitextview'
import { withUniwind } from 'uniwind'

const StyledUITextView = withUniwind(UITextView)

interface SelectableTextProps extends TextProps {
  children: ReactNode
}

export function SelectableText({ children, ...props }: SelectableTextProps) {
  return (
    <StyledUITextView
      selectable
      uiTextView
      selectionColor={Platform.OS === 'android' ? '#51d869' : undefined}
      {...props}>
      {children}
    </StyledUITextView>
  )
}
