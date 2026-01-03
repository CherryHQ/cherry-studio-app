import React from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import TextField from '@/componentsV2/base/TextField'
import type { PasteEventPayload } from '@/modules/text-input-wrapper'
import { TextInputWrapper } from '@/modules/text-input-wrapper'

import { ExpandButton } from '../buttons'
import { useMessageInput } from '../context/MessageInputContext'
import { useInputHeight } from '../hooks'
import { TEXT_FIELD_CONFIG } from '../types'

const { MAX_INPUT_HEIGHT } = TEXT_FIELD_CONFIG

export const MessageTextField: React.FC = () => {
  const { t } = useTranslation()
  const { text, setText, handleExpand, handlePasteImages } = useMessageInput()
  const { inputHeight, showExpandButton, handleContentSizeChange } = useInputHeight()

  const handlePaste = (payload: PasteEventPayload) => {
    if (payload.type === 'images') {
      handlePasteImages(payload.uris)
    }
    // Text paste is handled automatically by TextInput
  }

  return (
    <>
      {/* Single input with direct content size tracking */}
      <View style={{ flex: 1 }}>
        <TextInputWrapper onPaste={handlePaste}>
          <TextField className="w-full">
            <TextField.Input
              className="text-foreground h-auto pr-0"
              placeholder={t('inputs.placeholder')}
              value={text}
              onChangeText={setText}
              onContentSizeChange={handleContentSizeChange}
              multiline
              numberOfLines={10}
              selectionColor="#2563eb"
              style={{
                height: inputHeight,
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
