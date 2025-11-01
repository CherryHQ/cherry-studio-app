import React, { memo } from 'react'
import { View } from 'react-native'

import type { MainTextMessageBlock } from '@/types/message'

import ReactNativeMarkdown from '../../markdown/ReactNativeMarkdown'

interface Props {
  block: MainTextMessageBlock
  citationBlockId?: string
}

const MainTextBlock: React.FC<Props> = ({ block }) => {
  return (
    <View>
      <ReactNativeMarkdown block={block} />
    </View>
  )
}

export default memo(MainTextBlock)
