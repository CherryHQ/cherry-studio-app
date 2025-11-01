import * as Clipboard from 'expo-clipboard'
import { t } from 'i18next'
import type { ReactNode } from 'react'
import React, { useMemo } from 'react'
import type { TextStyle, ViewStyle } from 'react-native'
import type { RendererInterface } from 'react-native-marked'
import { MarkedTokenizer, Renderer } from 'react-native-marked'

import { useToast } from '@/hooks/useToast'

import { MarkdownCode } from './items/MarkdownCode'
import { MarkdownCodeSpan } from './items/MarkdownCodeSpan'
import MarkdownImage from './items/MarkdownImage'
import { MarkdownParagraph } from './items/MarkdownParagraph'
import { MarkdownTable } from './items/MarkdownTable'
import { MarkdownText } from './items/MarkdownText'
import { markdownColors } from './MarkdownStyles'
import type { ExtractMathResult } from './useMathEquation'
import { useMathEquation } from './useMathEquation'

// const logger = loggerService.withContext('useMarkedRenderer')

class CustomTokenizer extends MarkedTokenizer {}

class CustomRenderer extends Renderer implements RendererInterface {
  private isDark: boolean
  private equationColor: string
  private extractInlineMathEquation: (text: string) => ExtractMathResult[]
  private extractAllMathEquation: (text: string) => ExtractMathResult[]
  private renderInlineMath: (content: string, key?: string | number) => React.JSX.Element
  private renderBlockMath: (content: string, key?: string | number) => React.JSX.Element
  private showToast: (content: string) => void

  constructor(
    isDark: boolean,
    extractInlineMathEquation: (text: string) => ExtractMathResult[],
    extractAllMathEquation: (text: string) => ExtractMathResult[],
    renderInlineMath: (content: string, key?: string | number) => React.JSX.Element,
    renderBlockMath: (content: string, key?: string | number) => React.JSX.Element,
    showToast: (content: string) => void
  ) {
    super()
    this.isDark = isDark
    this.equationColor = isDark ? markdownColors.dark.text : markdownColors.light.text
    this.extractInlineMathEquation = extractInlineMathEquation
    this.extractAllMathEquation = extractAllMathEquation
    this.renderInlineMath = renderInlineMath
    this.renderBlockMath = renderBlockMath
    this.showToast = showToast
  }

  private async onCopy(content: string) {
    await Clipboard.setStringAsync(content)
    this.showToast(t('common.copied'))
  }

  // Override code block rendering
  code(text: string, language?: string, containerStyle?: ViewStyle, textStyle?: TextStyle): ReactNode {
    return (
      <MarkdownCode
        key={this.getKey()}
        text={text}
        language={language}
        isDark={this.isDark}
        onCopy={content => this.onCopy(content)}
        containerStyle={containerStyle}
        textStyle={textStyle}
      />
    )
  }

  // Override inline code rendering
  codespan(text: string): ReactNode {
    return (
      <MarkdownCodeSpan
        key={this.getKey()}
        text={text}
        extractInlineMathEquation={this.extractInlineMathEquation}
        renderInlineMath={this.renderInlineMath}
      />
    )
  }

  // Override paragraph rendering
  paragraph(children: ReactNode[], styles?: ViewStyle): ReactNode {
    return (
      <MarkdownParagraph key={this.getKey()} styles={styles}>
        {children}
      </MarkdownParagraph>
    )
  }

  text(text: string | ReactNode[], styles?: TextStyle): ReactNode {
    return (
      <MarkdownText
        key={this.getKey()}
        content={text}
        isDark={this.isDark}
        textStyle={styles}
        extractAllMathEquation={this.extractAllMathEquation}
        renderInlineMath={this.renderInlineMath}
        renderBlockMath={this.renderBlockMath}
      />
    )
  }

  list(
    ordered: boolean,
    li: ReactNode[],
    listStyle?: ViewStyle,
    textStyle?: TextStyle,
    startIndex?: number
  ): ReactNode {
    const currentColors = this.isDark ? markdownColors.dark : markdownColors.light
    return super.list(
      ordered,
      li,
      {
        ...listStyle,
        ...currentColors,
        alignItems: 'flex-end',
        justifyContent: 'flex-start'
      },
      { ...textStyle, textAlign: 'center', marginTop: 8 },
      startIndex
    )
  }

  listItem(children: ReactNode[], styles?: ViewStyle): ReactNode {
    return super.listItem(children, {
      ...styles,
      width: '100%',
      marginTop: 8
    })
  }

  hr(styles?: ViewStyle): ReactNode {
    return super.hr({ ...styles, marginVertical: 12 })
  }

  table(header: ReactNode[][], rows: ReactNode[][][]): ReactNode {
    return <MarkdownTable key={this.getKey()} header={header} rows={rows} isDark={this.isDark} />
  }

  image(uri: string, alt?: string): ReactNode {
    return <MarkdownImage key={this.getKey()} uri={uri} alt={alt} />
  }
}

/**
 * A hook that provides the configuration for react-native-marked,
 * including custom tokenizers and renderers for math equations and enhanced code blocks.
 * @param isDark - Whether the theme is dark, used for styling.
 */
export const useMarkedRenderer = (isDark: boolean) => {
  const equationColor = isDark ? markdownColors.dark.text : markdownColors.light.text
  const { extractInlineMathEquation, extractAllMathEquation, renderInlineMath, renderBlockMath } =
    useMathEquation(equationColor)

  // Use useToast hook
  const { show: showToast } = useToast()

  const renderer = useMemo(
    () =>
      new CustomRenderer(
        isDark,
        extractInlineMathEquation,
        extractAllMathEquation,
        renderInlineMath,
        renderBlockMath,
        showToast
      ),
    [isDark, extractInlineMathEquation, extractAllMathEquation, renderInlineMath, renderBlockMath, showToast]
  )
  const tokenizer = useMemo(() => new CustomTokenizer(), [])

  return { renderer, tokenizer }
}

// styles moved into components under ./items
