import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TextInputContentSizeChangeEvent } from 'react-native'
import { View } from 'react-native'

import TextField from '@/componentsV2/base/TextField'

import { ExpandButton } from './ExpandButton'

const LINE_HEIGHT = 20
const MAX_VISIBLE_LINES = 4

interface MessageTextFieldProps {
  text: string
  setText: (text: string) => void
  onExpand: () => void
}

export const MessageTextField: React.FC<MessageTextFieldProps> = ({ text, setText, onExpand }) => {
  const { t } = useTranslation()
  const [showExpandButton, setShowExpandButton] = useState(false)

  const handleContentSizeChange = (e: TextInputContentSizeChangeEvent) => {
    const { height } = e.nativeEvent.contentSize
    const lineCount = Math.ceil(height / LINE_HEIGHT)
    setShowExpandButton(lineCount > MAX_VISIBLE_LINES)
  }

  return (
    <>
      {/* hidden measurement input */}
      <View style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} className="w-full">
        <TextField className="w-full p-0">
          <TextField.Input
            className="text-foreground h-auto border-none p-0 text-base"
            value={text}
            multiline
            onContentSizeChange={handleContentSizeChange}
            colors={{
              blurBackground: 'transparent',
              focusBackground: 'transparent',
              blurBorder: 'transparent',
              focusBorder: 'transparent'
            }}
          />
        </TextField>
      </View>
      {/* visible input */}
      <View className="relative top-[5px]">
        {showExpandButton && <ExpandButton onPress={onExpand} />}
        <TextField className="w-full p-0">
          <TextField.Input
            className="text-foreground h-24 border-none p-0 text-base"
            placeholder={t('inputs.placeholder')}
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={10}
            selectionColor="#2563eb"
            colors={{
              blurBackground: 'transparent',
              focusBackground: 'transparent',
              blurBorder: 'transparent',
              focusBorder: 'transparent'
            }}
          />
        </TextField>
      </View>
    </>
  )
}
