import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'

import { presentDialog } from '@/componentsV2/base/Dialog/useDialogManager'
import { IconButton } from '@/componentsV2/base/IconButton'
import { Mic, Square } from '@/componentsV2/icons'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { useTheme } from '@/hooks/useTheme'

interface VoiceButtonProps {
  onTranscript: (text: string) => void
  onListeningChange?: (isListening: boolean) => void
}

export const VoiceButton: React.FC<VoiceButtonProps> = ({ onTranscript, onListeningChange }) => {
  const { t } = useTranslation()
  const { isDark } = useTheme()

  const { isListening, isProcessing, transcript, toggleListening } = useSpeechRecognition({
    onTranscript: (text, isFinal) => {
      if (isFinal) {
        onTranscript(text)
      }
    },
    onError: errorMessage => {
      // If speech is not detected, do not display an error dialog.
      const isNoSpeechError = errorMessage.toLowerCase().includes('no speech')
      if (isNoSpeechError) return

      let title = t('common.error_occurred')
      let content = errorMessage

      // Customize error messages based on error type
      if (errorMessage.includes('API key not configured') || errorMessage.includes('apiKey')) {
        title = t('settings.speechToText.api_key.error_title')
        content = t('settings.speechToText.api_key.error_not_configured')
      } else if (errorMessage.includes('permission denied') || errorMessage.includes('permission')) {
        title = t('settings.speechToText.permission.error_title')
        content = t('settings.speechToText.permission.error_denied')
      } else if (errorMessage.includes('not available') || errorMessage.includes('not configured')) {
        title = t('settings.speechToText.provider.error_title')
        content = t('settings.speechToText.provider.error_not_available')
      }

      presentDialog('error', {
        title,
        content
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
    if (isProcessing) return
    toggleListening()
  }

  const backgroundColor = isDark ? '#ffffff' : '#000000'

  // Render loading indicator when processing
  if (isProcessing) {
    return (
      <IconButton
        disabled
        icon={<ActivityIndicator size={22} className="text-foreground" />}
        style={{
          backgroundColor,
          borderRadius: 99,
          padding: 3,
          alignItems: 'center',
          justifyContent: 'center'
        }}
      />
    )
  }

  return (
    <IconButton
      onPress={handlePress}
      style={{
        backgroundColor: isListening ? 'red' : backgroundColor,
        borderRadius: 99,
        padding: 3,
        alignItems: 'center',
        justifyContent: 'center'
      }}
      icon={isListening ? <Square size={22} fill="white" /> : <Mic size={22} className="text-white  dark:text-black" />}
    />
  )
}
