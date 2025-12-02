import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition'
import { useRef, useState } from 'react'
import { Platform } from 'react-native'

import i18n from '@/i18n'
import { loggerService } from '@/services/LoggerService'

const logger = loggerService.withContext('SpeechRecognition')

export type SpeechRecognitionStatus = 'idle' | 'listening' | 'processing'

interface UseSpeechRecognitionOptions {
  onTranscript?: (text: string, isFinal: boolean) => void
  onError?: (error: string) => void
}

/**
 * Convert i18n language tag to speech recognition locale
 */
const getRecognitionLocale = (): string => {
  const lang = i18n.language

  // Map i18n language tags to speech recognition locales
  const localeMap: Record<string, string> = {
    'en-US': 'en-US',
    'zh-Hans-CN': 'zh-CN',
    'zh-CN': 'zh-CN',
    'zh-Hans-TW': 'zh-TW',
    'zh-TW': 'zh-TW',
    'ja-JP': 'ja-JP',
    'ru-RU': 'ru-RU'
  }

  return localeMap[lang] || 'en-US'
}

/**
 * Check if language detection is supported (Android 14+ only)
 */
const supportsLanguageDetection = (): boolean => {
  if (Platform.OS === 'android') {
    const version = Platform.Version
    return typeof version === 'number' && version >= 34 // Android 14 is API level 34
  }
  return false
}

export const useSpeechRecognition = (options: UseSpeechRecognitionOptions = {}) => {
  const { onTranscript, onError } = options

  // Use refs for callbacks to prevent stale closures in event listeners
  const onTranscriptRef = useRef(onTranscript)
  const onErrorRef = useRef(onError)

  // Update refs when props change
  onTranscriptRef.current = onTranscript
  onErrorRef.current = onError

  const [status, setStatus] = useState<SpeechRecognitionStatus>('idle')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Listen for recognition results
  useSpeechRecognitionEvent('result', event => {
    const result = event.results[0]
    if (result) {
      const text = result.transcript
      const isFinal = event.isFinal

      setTranscript(text)
      onTranscriptRef.current?.(text, isFinal)

      if (isFinal) {
        setStatus('idle')
      }
    }
  })

  // Listen for recognition start
  useSpeechRecognitionEvent('start', () => {
    logger.info('Speech recognition started')
    setStatus('listening')
    setError(null)
  })

  // Listen for recognition end
  useSpeechRecognitionEvent('end', () => {
    logger.info('Speech recognition ended')
    setStatus('idle')
  })

  // Listen for errors
  useSpeechRecognitionEvent('error', event => {
    logger.error('Speech recognition error:', new Error(event.message), { code: event.error })
    setError(event.message)
    setStatus('idle')
    onErrorRef.current?.(event.message)
  })

  // Start speech recognition
  const startListening = async () => {
    // Set status immediately to prevent race conditions
    setStatus('processing')

    try {
      // Check if recognition is available
      const isAvailable = await ExpoSpeechRecognitionModule.isRecognitionAvailable()
      if (!isAvailable) {
        const errorMsg = 'Speech recognition is not available on this device'
        logger.warn(errorMsg)
        setError(errorMsg)
        onErrorRef.current?.(errorMsg)
        setStatus('idle')
        return false
      }

      // Request permissions
      const permissionResult = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
      if (!permissionResult.granted) {
        const errorMsg = 'Speech recognition permission denied'
        logger.info(errorMsg)
        setError(errorMsg)
        onErrorRef.current?.(errorMsg)
        setStatus('idle')
        return false
      }

      // Clear previous state
      setTranscript('')
      setError(null)

      // Start recognition with configuration
      ExpoSpeechRecognitionModule.start({
        lang: getRecognitionLocale(),
        interimResults: true,
        continuous: true,
        maxAlternatives: 1,
        addsPunctuation: true,
        // iOS: Use dictation task hint for better pause tolerance
        iosTaskHint: 'dictation',
        // Enable language detection on supported devices
        ...(supportsLanguageDetection() && {
          // Note: languageDetection is only available on Android 14+
          // The library will automatically handle unsupported features
          languageDetection: true
        })
      })

      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error starting speech recognition'
      logger.error('Failed to start speech recognition:', err instanceof Error ? err : new Error(String(err)))
      setError(errorMsg)
      setStatus('idle')
      onErrorRef.current?.(errorMsg)
      return false
    }
  }

  // Stop speech recognition
  const stopListening = () => {
    try {
      ExpoSpeechRecognitionModule.stop()
      setStatus('processing') // Processing final results
    } catch (err) {
      logger.error('Failed to stop speech recognition:', err instanceof Error ? err : new Error(String(err)))
      setStatus('idle')
    }
  }

  // Toggle speech recognition
  const toggleListening = async () => {
    if (status === 'listening') {
      stopListening()
    } else if (status === 'idle') {
      await startListening()
    }
    // If processing, do nothing
  }

  // Abort speech recognition (cancel without processing)
  const abortListening = () => {
    try {
      ExpoSpeechRecognitionModule.abort()
      setStatus('idle')
      setTranscript('')
    } catch (err) {
      logger.error('Failed to abort speech recognition:', err instanceof Error ? err : new Error(String(err)))
      setStatus('idle')
    }
  }

  return {
    status,
    isListening: status === 'listening',
    isProcessing: status === 'processing',
    transcript,
    error,
    startListening,
    stopListening,
    toggleListening,
    abortListening
  }
}
