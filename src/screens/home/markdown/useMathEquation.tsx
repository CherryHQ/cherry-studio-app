import React, { memo } from 'react'
import { View } from 'react-native'
import MathJax from 'react-native-mathjax-svg'

// Memoized MathJax component to prevent unnecessary re-renders
export const MemoizedMathJax = memo(
  ({ content, fontSize, color }: { content: string; fontSize: number; color: string }) => {
    return (
      <MathJax fontSize={fontSize} color={color} style={{ alignItems: 'center', justifyContent: 'center' }}>
        {content}
      </MathJax>
    )
  }
)

MemoizedMathJax.displayName = 'MemoizedMathJax'

export type ExtractMathResult = { type: 'text' | 'inline-latex' | 'block-latex'; content: string }

/**
 * Hook for math equation functionality
 * @param equationColor - Color for the math equations
 */
export const useMathEquation = (equationColor: string) => {
  const splitLatex = (text: string, type: 'inline' | 'block') => {
    let match: RegExpExecArray | null
    let parts: ExtractMathResult[] = []
    let lastIndex = 0

    const blockReg = /\\\[\s*([\s\S]+?)\s*\\\]|\$\$\s*([\s\S]+?)\s*\$\$/g
    const inlineReg = /\$+([^$\n]+?)\$+|\\\((.+?)\\\)/g
    const regex = type === 'inline' ? inlineReg : blockReg

    while ((match = regex.exec(text))) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex, match.index)
      })
      lastIndex = match.index
      parts.push({
        type: type === 'inline' ? 'inline-latex' : 'block-latex',
        content: match[1] || match[2]
      })
      lastIndex = match.index + match[0].length
    }

    parts.push({
      type: 'text',
      content: text.slice(lastIndex, text.length)
    })
    parts = parts.filter(item => item.content.length !== 0)
    return parts
  }

  /**
   * Check if text contains math equation pattern
   * @param text - Text to check
   * @returns Matched equation content or null
   */
  const extractInlineMathEquation = (text: string) => {
    return splitLatex(text, 'inline')
  }

  /**
   * Check if text contains block math equation pattern
   * @param text - Text to check
   * @returns Matched block equation content or null
   */
  const extractBlockMathEquation = (text: string) => {
    return splitLatex(text, 'block')
  }

  const extractAllMathEquation = (text: string) => {
    const blocks = extractBlockMathEquation(text)
    return blocks.flatMap(block => {
      if (block.type === 'block-latex') return block
      return extractInlineMathEquation(block.content)
    })
  }

  /**
   * Render inline math equation
   * @param content - Math equation content
   * @param key - React key for the component
   */
  const renderInlineMath = (content: string, key?: string | number) => {
    return (
      <View key={key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <MemoizedMathJax content={content} fontSize={16} color={equationColor} />
      </View>
    )
  }

  /**
   * Render block math equation (centered, larger)
   * @param content - Math equation content
   * @param key - React key for the component
   */
  const renderBlockMath = (content: string, key?: string | number) => {
    return (
      <View
        key={key}
        style={{
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 10
        }}>
        <MemoizedMathJax content={content} fontSize={18} color={equationColor} />
      </View>
    )
  }

  return {
    extractInlineMathEquation,
    extractAllMathEquation,
    renderInlineMath,
    renderBlockMath
  }
}
