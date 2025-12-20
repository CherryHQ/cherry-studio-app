import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TextInputContentSizeChangeEvent } from 'react-native'
import { View } from 'react-native'

import TextField from '@/componentsV2/base/TextField'
import type { PasteEventPayload } from '@/modules/text-input-wrapper'
import { TextInputWrapper } from '@/modules/text-input-wrapper'

import { useMessageInput } from '../context/MessageInputContext'
import { ExpandButton } from '../ExpandButton'

const LINE_HEIGHT = 20
const MAX_VISIBLE_LINES = 4
const MAX_INPUT_HEIGHT = 96

export const MessageTextField: React.FC = () => {
  const { t } = useTranslation()
  const { text, setText, handleExpand, handlePasteImages } = useMessageInput()

  const [showExpandButton, setShowExpandButton] = useState(false)
  const [inputHeight, setInputHeight] = useState<number | undefined>(undefined)

  const handleContentSizeChange = (e: TextInputContentSizeChangeEvent) => {
    const { height } = e.nativeEvent.contentSize
    const lineCount = Math.ceil(height / LINE_HEIGHT)
    setShowExpandButton(lineCount > MAX_VISIBLE_LINES)
    setInputHeight(height)
  }

  const handlePaste = (payload: PasteEventPayload) => {
    if (payload.type === 'images') {
      handlePasteImages(payload.uris)
    }
    // Text paste is handled automatically by TextInput
  }

  const computedInputHeight = inputHeight === undefined ? undefined : Math.min(inputHeight, MAX_INPUT_HEIGHT)

  return (
    <>
      {/* hidden measurement input */}
      <View style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} className="w-full">
        <TextField className="w-full">
          <TextField.Input
            className="text-foreground h-auto pr-0"
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
      <View style={{ flex: 1 }}>
        <TextInputWrapper onPaste={handlePaste}>
          <TextField className="w-full">
            <TextField.Input
              className="text-foreground h-auto pr-0"
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
      {showExpandButton && (
        <View className="absolute right-2 top-2">
          <ExpandButton onPress={handleExpand} />
        </View>
      )}
    </>
  )
}
