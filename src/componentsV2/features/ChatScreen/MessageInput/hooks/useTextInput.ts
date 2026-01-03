import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { presentDialog } from '@/componentsV2/base/Dialog'
import type { FileMetadata } from '@/types/file'

import { isLongText, processInputText } from '../services'
import { LONG_TEXT_THRESHOLD } from '../types'

export interface UseTextInputOptions {
  onFileCreated?: (file: FileMetadata) => void
  threshold?: number
}

export interface UseTextInputReturn {
  text: string
  setText: (text: string) => void
  clearText: () => void
  isLongText: boolean
}

/**
 * Hook for managing text input state with long text handling
 * Extracted from useMessageInputLogic lines 50-69
 */
export function useTextInput(options: UseTextInputOptions = {}): UseTextInputReturn {
  const { t } = useTranslation()
  const [text, setTextInternal] = useState('')
  const threshold = options.threshold ?? LONG_TEXT_THRESHOLD

  const setText = async (newText: string) => {
    // Check if text exceeds threshold
    if (isLongText(newText, threshold)) {
      const result = await processInputText(newText, {
        threshold,
        onConvertToFile: options.onFileCreated
      })

      if (result.success) {
        setTextInternal(result.data?.processedText ?? '')
        if (result.data?.convertedToFile) {
          presentDialog('info', {
            title: t('inputs.longTextConverted.title'),
            content: t('inputs.longTextConverted.message', { length: newText.length })
          })
        }
      } else {
        // Fallback on error - keep the text
        setTextInternal(newText)
      }
    } else {
      setTextInternal(newText)
    }
  }

  const clearText = () => {
    setTextInternal('')
  }

  return {
    text,
    setText,
    clearText,
    isLongText: isLongText(text, threshold)
  }
}
