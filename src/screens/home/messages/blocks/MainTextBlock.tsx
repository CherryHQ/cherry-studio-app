import { isEmpty } from 'lodash'
import React, { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { MainTextMessageBlock } from '@/types/message'
import { escapeBrackets, removeSvgEmptyLines } from '@/utils/formats'

import { MarkdownRenderer } from '../../markdown/MarkdownRenderer'

interface Props {
  block: MainTextMessageBlock
  citationBlockId?: string
}
// TOFIX：会有一个奇怪的空组件渲染，导致两个block之间的gap有问题（由于会产生一个莫名其妙的组件）
// 在连续调用mcp时会出现
const MainTextBlock: React.FC<Props> = ({ block }) => {
  const { t } = useTranslation()

  const getContent = () => {
    const empty = isEmpty(block.content)
    const paused = block.status === 'paused'
    const content = empty && paused ? t('message.chat.completion.paused') : block.content
    return removeSvgEmptyLines(escapeBrackets(content))
  }

  return (
    <View>
      <MarkdownRenderer content={getContent()} />
    </View>
  )
}

export default memo(MainTextBlock)
