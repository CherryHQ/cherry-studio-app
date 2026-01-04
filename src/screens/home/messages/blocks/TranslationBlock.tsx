import { Divider } from 'heroui-native'
import type { FC } from 'react'
import React from 'react'
import { View } from 'react-native'

import { XStack } from '@/componentsV2'
import { Languages } from '@/componentsV2/icons/LucideIcon'
import type { TranslationMessageBlock } from '@/types/message'
import { escapeBrackets, removeSvgEmptyLines } from '@/utils/formats'

import { MarkdownRenderer } from '../../markdown/MarkdownRenderer'

interface Props {
  block: TranslationMessageBlock
}

const TranslationBlock: FC<Props> = ({ block }) => {
  const getContent = () => {
    return removeSvgEmptyLines(escapeBrackets(block.content))
  }

  return (
    <View>
      <XStack className="items-center justify-center gap-2.5">
        <Divider className="flex-1 bg-zinc-400/40" thickness={1} />
        <Languages size={16} className="text-gray-700" />
        <Divider className="flex-1 bg-zinc-400/40" thickness={1} />
      </XStack>
      <MarkdownRenderer content={getContent()} />
    </View>
  )
}

export default TranslationBlock
