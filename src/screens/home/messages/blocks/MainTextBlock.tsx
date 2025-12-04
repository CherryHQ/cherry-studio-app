import React, { memo } from 'react'
import { View } from 'react-native'

import type { MainTextMessageBlock } from '@/types/message'

import ReactNativeMarkdown from '../../markdown/ReactNativeMarkdown'

interface Props {
  block: MainTextMessageBlock
  citationBlockId?: string
}
// TOFIX：会有一个奇怪的空组件渲染，导致两个block之间的gap有问题（由于会产生一个莫名其妙的组件）
// 在连续调用mcp时会出现
const MainTextBlock: React.FC<Props> = ({ block }) => {
  return (
    <View>
      <ReactNativeMarkdown block={block} />
    </View>
  )
}

export default memo(MainTextBlock)
