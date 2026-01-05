import * as Clipboard from 'expo-clipboard'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import MathJax from 'react-native-mathjax-svg'
import { withUniwind } from 'uniwind'

import type { ContextMenuListProps } from '@/componentsV2'
import { ContextMenu } from '@/componentsV2'
import { Copy } from '@/componentsV2/icons/LucideIcon'
import { useToast } from '@/hooks/useToast'

const StyledMathJax = withUniwind(MathJax, {
  color: {
    fromClassName: 'colorClassName',
    styleProperty: 'color'
  }
})

interface MarkdownMathBlockProps {
  content: string
}

export function MarkdownMathBlock({ content }: MarkdownMathBlockProps) {
  // 清理 LaTeX 内容，移除首尾的 $ 符号
  const mathContent = content.replace(/^\$+|\$+$/g, '').trim()
  const { t } = useTranslation()
  const toast = useToast()

  const handleCopyContent = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(mathContent)
      toast.show(t('common.copied'))
    } catch {
      toast.show(t('common.error_occurred'), { color: 'red', duration: 2500 })
    }
  }, [mathContent, t, toast])

  if (!mathContent) return null
  const displayContent = `\\displaystyle ${mathContent}`

  const contextMenuItems: ContextMenuListProps[] = [
    {
      title: t('common.copy_latex'),
      iOSIcon: 'doc.on.doc',
      androidIcon: <Copy size={16} />,
      onSelect: handleCopyContent
    }
  ]

  return (
    <ContextMenu list={contextMenuItems} withHighLight={false} borderRadius={12}>
      <View className="my-3 items-center justify-center rounded-xl px-5 py-5">
        <StyledMathJax colorClassName="text-foreground" fontSize={20}>
          {displayContent}
        </StyledMathJax>
      </View>
    </ContextMenu>
  )
}
