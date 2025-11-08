import { Divider } from 'heroui-native'
import type { FC } from 'react'
import React from 'react'
import { View } from 'react-native'

import { XStack } from '@/componentsV2'
import { Languages } from '@/componentsV2/icons/LucideIcon'
import type { TranslationMessageBlock } from '@/types/message'

import ReactNativeMarkdown from '../../markdown/ReactNativeMarkdown'

interface Props {
  block: TranslationMessageBlock
}

const TranslationBlock: FC<Props> = ({ block }) => {
  return (
    <View>
      <XStack className="items-center justify-center gap-2.5">
        <Divider className="bg-gray-40 flex-1" thickness={1} />
        <Languages size={16} className="text-gray-700" />
        <Divider className="bg-gray-40 flex-1" thickness={1} />
      </XStack>
      <ReactNativeMarkdown block={block} />
    </View>
  )
}

export default TranslationBlock
