import React from 'react'
import { View } from 'react-native'
import MathJax from 'react-native-mathjax-svg'
import { withUniwind } from 'uniwind'

const StyledMathJax = withUniwind(MathJax, {
  color: {
    fromClassName: 'colorClassName',
    styleProperty: 'color'
  }
})

interface MarkdownMathInlineProps {
  content: string
}

export function MarkdownMathInline({ content }: MarkdownMathInlineProps) {
  // 清理 LaTeX 内容，移除首尾的 $ 符号
  const mathContent = content.replace(/^\$+|\$+$/g, '').trim()

  if (!mathContent) return null

  return (
    <View className="flex-row items-center">
      <StyledMathJax colorClassName="text-foreground" fontSize={16}>
        {mathContent}
      </StyledMathJax>
    </View>
  )
}
