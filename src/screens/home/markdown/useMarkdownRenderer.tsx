import { Copy } from '@tamagui/lucide-icons'
import * as Clipboard from 'expo-clipboard'
import markdownIt from 'markdown-it'
import markdownItMath from 'markdown-it-math/no-default-renderer'
import React from 'react'
import { StyleSheet } from 'react-native'
import CodeHighlighter from 'react-native-code-highlighter'
import { ASTNode } from 'react-native-markdown-display'
import MathJax from 'react-native-mathjax-svg'
import { atomOneDark, atomOneLight } from 'react-syntax-highlighter/dist/esm/styles/hljs'
import { Button, Image, Text, View, XStack } from 'tamagui'
import temml from 'temml'

import { loggerService } from '@/services/LoggerService'
import { getGreenColor } from '@/utils/color'
import { getCodeLanguageIcon } from '@/utils/icons/codeLanguage'

import { markdownColors } from './MarkdownStyles'
const logger = loggerService.withContext('useMarkdownRenderer')

const markdownItInstance = markdownIt().use(markdownItMath, {
  inlineAllowWhiteSpacePadding: true,
  inlineRenderer: str => temml.renderToString(str),
  blockRenderer: str => temml.renderToString(str, { displayMode: true })
})

/**
 * A hook that provides the configuration for react-native-markdown-display,
 * including the markdown-it instance and custom rendering rules for math equations.
 * @param isDark - Whether the theme is dark, used for coloring equations.
 */
export const useMarkdownRenderer = (isDark: boolean) => {
  const equationColor = isDark ? markdownColors.dark.text : markdownColors.light.text

  const onCopy = async (content: string) => {
    await Clipboard.setStringAsync(content)
  }

  const renderEquation = (node: ASTNode, isBlock: boolean) => {
    logger.info('renderEquation', node)

    try {
      return (
        <View
          key={node.key}
          style={{
            paddingVertical: isBlock ? 10 : 0,
            justifyContent: 'center',
            alignItems: 'center'
          }}>
          <MathJax color={equationColor}>{node.content}</MathJax>
        </View>
      )
    } catch (error) {
      logger.error('Error rendering equation:', error)
      return <Text key={node.key}>[Math Error]</Text>
    }
  }

  const renderFence = node => {
    return (
      <View
        key={node.index}
        style={{
          gap: 10,
          padding: 5,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: isDark ? '#8de59e26' : '#8de59e26'
        }}>
        <XStack
          flex={1}
          height={48}
          justifyContent="space-between"
          alignItems="center"
          borderBottomWidth={1}
          borderColor={getGreenColor(isDark, 10)}>
          <XStack paddingLeft={12} gap={8} flex={1} alignItems="center">
            <Image source={getCodeLanguageIcon(node.sourceInfo)} width={18} height={18} />
            <Text fontSize={13} lineHeight={16}>
              {node.sourceInfo.toUpperCase()}
            </Text>
          </XStack>
          <Button chromeless circular icon={<Copy size={16} />} onPress={() => onCopy(node.content)} />
        </XStack>
        <CodeHighlighter
          scrollViewProps={{
            contentContainerStyle: {
              ...styles.codeContainer,
              backgroundColor: isDark ? '#121213ff' : '#f7f7f7ff'
            },
            showsHorizontalScrollIndicator: false
          }}
          textStyle={styles.text}
          hljsStyle={isDark ? atomOneDark : atomOneLight}
          language={node.sourceInfo}
          wrapLines={true}
          wrapLongLines={true}>
          {node.content}
        </CodeHighlighter>
      </View>
    )
  }

  const rules = {
    math_inline: (node: ASTNode) => renderEquation(node, false),
    math_block: (node: ASTNode) => renderEquation(node, true),
    textgroup: (node: ASTNode, children: React.ReactNode) => {
      return <Text key={node.key}>{children}</Text>
    },
    fence: node => renderFence(node)
  }

  return { markdownItInstance, rules }
}

const styles = StyleSheet.create({
  codeContainer: {
    paddingLeft: 12,
    paddingRight: 16,
    paddingVertical: 10,
    minWidth: '100%'
  },
  text: {
    fontSize: 14,
    fontFamily: 'JetbrainMono'
  }
})
