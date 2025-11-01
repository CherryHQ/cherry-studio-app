import React from 'react'
import { Text } from '@/componentsV2'
import { ExtractMathResult } from '../useMathEquation'

interface MarkdownCodeSpanProps {
  text: string
  extractInlineMathEquation: (text: string) => ExtractMathResult[]
  renderInlineMath: (content: string, key?: string | number) => React.JSX.Element
}

export const MarkdownCodeSpan: React.FC<MarkdownCodeSpanProps> = ({
  text,
  extractInlineMathEquation,
  renderInlineMath
}) => {
  const result = extractInlineMathEquation(text)

  return (
    <>
      {result.map(({ type, content }, index) => {
        if (type === 'text') {
          return (
            <Text key={index} className="select-none font-mono text-green-500">
              {content}
            </Text>
          )
        } else if (type === 'block-latex') {
          return null
        } else {
          return renderInlineMath(content, index)
        }
      })}
    </>
  )
}

export default MarkdownCodeSpan
