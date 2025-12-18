import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TextInputContentSizeChangeEvent } from 'react-native'
import { View } from 'react-native'

import TextField from '@/componentsV2/base/TextField'
import type { PasteEventPayload } from '@/modules/text-input-wrapper'
import { TextInputWrapper } from '@/modules/text-input-wrapper'

import { ExpandButton } from './ExpandButton'

const LINE_HEIGHT = 20
const MAX_VISIBLE_LINES = 4
const MAX_INPUT_HEIGHT = 96

interface MessageTextFieldProps {
  text: string
  setText: (text: string) => void
  onExpand: () => void
  onPasteImages?: (uris: string[]) => void
}

export const MessageTextField: React.FC<MessageTextFieldProps> = ({ text, setText, onExpand, onPasteImages }) => {
  const { t } = useTranslation()
  const [showExpandButton, setShowExpandButton] = useState(false)
  const [inputHeight, setInputHeight] = useState<number | undefined>(undefined)

  const handleContentSizeChange = (e: TextInputContentSizeChangeEvent) => {
    const { height } = e.nativeEvent.contentSize
    const lineCount = Math.ceil(height / LINE_HEIGHT)
    setShowExpandButton(lineCount > MAX_VISIBLE_LINES)
    setInputHeight(height)
  }

  const handlePaste = (payload: PasteEventPayload) => {
    if (payload.type === 'images' && onPasteImages) {
      onPasteImages(payload.uris)
    }
    // Text paste is handled automatically by TextInput
  }

  const computedInputHeight = inputHeight === undefined ? undefined : Math.min(inputHeight, MAX_INPUT_HEIGHT)

  return (
    <>
      {/* hidden measurement input */}
      <View style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} className="w-full">
        <TextField className="w-full rounded-2xl p-0">
          <TextField.Input
            className="text-foreground h-auto"
            value={text}
            multiline
            onContentSizeChange={handleContentSizeChange}
            colors={{
              blurBackground: 'transparent',
              focusBackground: 'transparent',
              blurBorder: 'transparent',
              focusBorder: 'transparent'
            }}
            style={{
              minHeight: 36,
              fontSize: 20,
              lineHeight: 26,
              paddingVertical: 6
            }}
          />
        </TextField>
      </View>
      {/* visible input */}
      <View className="relative">
        <View className="right-2 top-2">{showExpandButton && <ExpandButton onPress={onExpand} />}</View>
        <TextInputWrapper onPaste={handlePaste}>
          <TextField className="w-full rounded-3xl p-0">
            <TextField.Input
              className="text-foreground h-auto"
              placeholder={t('inputs.placeholder')}
              value={text}
              onChangeText={setText}
              multiline
              numberOfLines={10}
              selectionColor="#2563eb"
              style={{
                height: computedInputHeight,
                maxHeight: MAX_INPUT_HEIGHT,
                minHeight: 36,
                fontSize: 20,
                lineHeight: 26,
                paddingVertical: 6
              }}
              colors={{
                blurBackground: 'transparent',
                focusBackground: 'transparent',
                blurBorder: 'transparent',
                focusBorder: 'transparent'
              }}
            />
          </TextField>
        </TextInputWrapper>
      </View>
    </>
  )
}
