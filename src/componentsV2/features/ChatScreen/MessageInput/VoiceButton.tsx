import { MotiView } from 'moti'
import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'

import { IconButton } from '@/componentsV2/base/IconButton'
import { CircleStop, VoiceIcon } from '@/componentsV2/icons'
import { useDialog } from '@/hooks/useDialog'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'

interface VoiceButtonProps {
  onTranscript: (text: string) => void
  onListeningChange?: (isListening: boolean) => void
  disabled?: boolean
}

export const VoiceButton: React.FC<VoiceButtonProps> = ({
  onTranscript,
  onListeningChange,
  disabled = false
}) => {
  const { t } = useTranslation()
  const dialog = useDialog()

  const { isListening, isProcessing, transcript, toggleListening } = useSpeechRecognition({
    onTranscript: (text, isFinal) => {
      // Only update on final results to avoid overwriting during interim results
      if (isFinal) {
        onTranscript(text)
      }
    },
    onError: errorMessage => {
      dialog.open({
        type: 'error',
        title: t('common.error_occurred'),
        content: errorMessage
      })
    }
  })

  // Update transcript in real-time during listening
  useEffect(() => {
    if (isListening && transcript) {
      onTranscript(transcript)
    }
  }, [transcript, isListening, onTranscript])

  // Notify parent when listening state changes
  useEffect(() => {
    onListeningChange?.(isListening || isProcessing)
  }, [isListening, isProcessing, onListeningChange])

  const handlePress = () => {
    if (disabled || isProcessing) return
    toggleListening()
  }

  // Render loading indicator when processing
  if (isProcessing) {
    return (
      <IconButton
        disabled
        icon={<ActivityIndicator size="small" className="text-text-primary" />}
      />
    )
  }

  return (
    <IconButton
      onPress={handlePress}
      disabled={disabled}
      icon={
        isListening ? (
          <MotiView
            from={{ scale: 1 }}
            animate={{ scale: [1, 1.1, 1] }}
            transition={{
              type: 'timing',
              duration: 800,
              loop: true
            }}>
            <CircleStop size={24} className="text-text-delete" />
          </MotiView>
        ) : (
          <VoiceIcon
            size={20}
            className={disabled ? 'text-text-tertiary' : 'text-text-primary'}
          />
        )
      }
    />
  )
}
