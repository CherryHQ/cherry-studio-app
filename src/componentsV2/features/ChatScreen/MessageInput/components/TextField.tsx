import React from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import TextField from '@/componentsV2/base/TextField'
import type { PasteEventPayload } from '@/modules/text-input-wrapper'
import { TextInputWrapper } from '@/modules/text-input-wrapper'
import { loggerService } from '@/services/LoggerService'

import { ExpandButton } from '../buttons'
import { useMessageInput } from '../context/MessageInputContext'
import { useInputHeight } from '../hooks'
import { TEXT_FIELD_CONFIG } from '../types'

const logger = loggerService.withContext('MessageTextField')
const { MAX_INPUT_HEIGHT, MIN_INPUT_HEIGHT } = TEXT_FIELD_CONFIG

export const MessageTextField: React.FC = () => {
  const { t } = useTranslation()
  const { text, setText, handleExpand, handlePasteImages } = useMessageInput()
  const { showExpandButton, handleContentSizeChange } = useInputHeight()

  const handlePaste = (payload: PasteEventPayload) => {
    try {
      if (payload.type === 'images') {
        handlePasteImages(payload.uris)
      }
      // Text paste is handled automatically by TextInput
    } catch (error) {
      logger.error('Error handling paste:', error)
    }
  }

  return (
    <>
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
                maxHeight: MAX_INPUT_HEIGHT,
                minHeight: MIN_INPUT_HEIGHT,
                fontSize: 20,
                lineHeight: 26,
                paddingVertical: 8,
                textAlignVertical: 'center'
              }}
              animation={{
                backgroundColor: {
                  value: {
                    blur: 'transparent',
                    focus: 'transparent',
                    error: 'transparent'
                  }
                },
                borderColor: {
                  value: {
                    blur: 'transparent',
                    focus: 'transparent',
                    error: 'transparent'
                  }
                }
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
