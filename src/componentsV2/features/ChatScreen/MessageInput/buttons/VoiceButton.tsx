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

      presentDialog('error', {
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
