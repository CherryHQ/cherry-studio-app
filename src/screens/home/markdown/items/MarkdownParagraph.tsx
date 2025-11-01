import type { ReactNode } from 'react'
import React from 'react'
import type { ViewStyle } from 'react-native'
import { View } from 'react-native'

interface MarkdownParagraphProps {
  children: ReactNode[]
  styles?: ViewStyle
}

export const MarkdownParagraph: React.FC<MarkdownParagraphProps> = ({ children, styles }) => {
  return (
    <View className="select-none" style={{ ...styles }}>
      {children}
    </View>
  )
}

export default MarkdownParagraph
