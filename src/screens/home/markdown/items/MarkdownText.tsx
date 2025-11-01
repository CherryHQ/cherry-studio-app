import type { ReactNode } from 'react'
import React from 'react'
import type { TextStyle } from 'react-native'

import { Text } from '@/componentsV2'

import { markdownColors } from '../MarkdownStyles'
import type { ExtractMathResult } from '../useMathEquation'

interface MarkdownTextProps {
  content: string | ReactNode[]
  isDark: boolean
  textStyle?: TextStyle
  extractAllMathEquation: (text: string) => ExtractMathResult[]
  renderInlineMath: (content: string, key?: string | number) => React.JSX.Element
  renderBlockMath: (content: string, key?: string | number) => React.JSX.Element
}

export const MarkdownText: React.FC<MarkdownTextProps> = ({
  content,
  isDark,
  textStyle,
  extractAllMathEquation,
  renderInlineMath,
  renderBlockMath
}) => {
  const currentColors = isDark ? markdownColors.dark : markdownColors.light

  if (typeof content === 'string') {
    const result = extractAllMathEquation(content)
    return (
      <>
        {result.map(({ type, content }, index) => {
          if (type === 'block-latex') return renderBlockMath(content, index)
          if (type === 'inline-latex') return renderInlineMath(content, index)
          return (
            <Text
              key={index}
              style={{
                color: currentColors.text,
                userSelect: 'none',
                ...textStyle
              }}>
              {content}
            </Text>
          )
        })}
      </>
    )
  }

  return (
    <Text
      style={{
        userSelect: 'none',
        fontSize: 16,
        lineHeight: 24,
        color: currentColors.text,
        ...textStyle
      }}>
      {content}
    </Text>
  )
}

export default MarkdownText
