import { isEmpty } from 'lodash'
import { FC, memo } from 'react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import Markdown from 'react-native-markdown-display'
import { useThemeName, View } from 'tamagui'

import { MainTextMessageBlock, ThinkingMessageBlock, TranslationMessageBlock } from '@/types/message'
import { escapeBrackets, removeSvgEmptyLines } from '@/utils/formats'

interface Props {
  block: MainTextMessageBlock | TranslationMessageBlock | ThinkingMessageBlock
}

const ReactNativeMarkdown: FC<Props> = ({ block }) => {
  const { t } = useTranslation()
  const theme = useThemeName()
  const color = theme === 'dark' ? 'white' : 'black'

  const getMessageContent = (block: MainTextMessageBlock | TranslationMessageBlock | ThinkingMessageBlock) => {
    const empty = isEmpty(block.content)
    const paused = block.status === 'paused'
    const content = empty && paused ? t('message.chat.completion.paused') : block.content
    return removeSvgEmptyLines(escapeBrackets(content))
  }

  const messageContent = getMessageContent(block)
  // full style https://github.com/iamacup/react-native-markdown-display/blob/master/src/lib/styles.js
  const style = {
    text: {
      color: color,
      fontSize: 12
    },
    body: {
      backgroundColor: 'transparent',
      gap: 5
    },
    blockquote: {
      backgroundColor: 'transparent'
    },
    code_inline: {
      color: color,
      backgroundColor: 'transparent'
    },
    fence: {
      color: color,
      backgroundColor: 'rgba(135, 142, 168, 0.2)',
      borderWidth: 0
    },
    table: {
      borderWidth: 1,
      borderColor: color,
      borderRadius: 3
    }
  }
  return (
    <View>
      <Markdown style={style}>{messageContent}</Markdown>
    </View>
  )
}

export default memo(ReactNativeMarkdown)
