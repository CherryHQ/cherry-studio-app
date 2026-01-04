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

interface NitroMathBlockProps {
  content: string
}

export function NitroMathBlock({ content }: NitroMathBlockProps) {
  // 清理 LaTeX 内容，移除首尾的 $ 符号
  const mathContent = content.replace(/^\$+|\$+$/g, '').trim()

  if (!mathContent) return null

  return (
    <View className="my-3 items-center justify-center rounded-xl px-5 py-5">
      <StyledMathJax colorClassName="text-foreground" fontSize={20}>
        {`\\displaystyle ${mathContent}`}
      </StyledMathJax>
    </View>
  )
}
