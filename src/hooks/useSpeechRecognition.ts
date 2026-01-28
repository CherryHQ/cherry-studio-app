import { Audio } from 'expo-av'
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition'
import { useRef, useState } from 'react'
import { Platform } from 'react-native'

import i18n from '@/i18n'
import { DashScopeSpeechService } from '@/services/DashScopeSpeechService'
import { loggerService } from '@/services/LoggerService'
import { usePreference } from '@/hooks/usePreference'
import { getSpeechToTextProviders } from '@/config/speechToTextProviders'

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

  // Get current speech-to-text provider preference
  const [currentProviderId] = usePreference('speechToTextProvider' as any)
  const [providersConfig] = usePreference('speechToTextProviders' as any)

  // Audio recording ref for API providers
  const recordingRef = useRef<Audio.Recording | null>(null)
  const statusRef = useRef(status)

  // Update status ref when status changes
  statusRef.current = status

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
    logger.info('Starting speech recognition, current provider:', currentProviderId)

    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      if (statusRef.current === 'processing') {
        logger.error('Speech recognition timed out after 10 seconds')
        setStatus('idle')
        onErrorRef.current?.('Speech recognition initialization timed out. Please try again.')
      }
    }, 10000)

    try {
      const providers = getSpeechToTextProviders()
      const provider = providers.find(p => p.id === currentProviderId) || providers[0]

      logger.info('Found provider:', provider?.id, 'Type:', provider?.type)

      if (!provider) {
        const errorMsg = 'No speech-to-text provider configured'
        logger.warn(errorMsg)
        setError(errorMsg)
        onErrorRef.current?.(errorMsg)
        setStatus('idle')
        clearTimeout(timeoutId)
        return false
      }

      // Handle API providers
      if (provider.type === 'api') {
        logger.info('Using API provider:', provider.id)
        const apiKey = providersConfig?.[provider.id]?.apiKey
        logger.info('API key configured:', !!apiKey)

        if (!apiKey) {
          const errorMsg = 'API key not configured for this provider'
          logger.warn(errorMsg)
          setError(errorMsg)
          onErrorRef.current?.(errorMsg)
          setStatus('idle')
          clearTimeout(timeoutId)
          return false
        }

        // Skip permission check and audio mode setup, try to create recording directly
        logger.info('Setting audio mode and creating recording...')
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true
          })
        } catch (e) {
          logger.warn('Failed to set audio mode:', e)
        }

        // Create and start recording with WAV format (supported by DashScope)
        logger.info('Creating recording...')
        const recordingConfig = {
          android: {
            extension: '.m4a',
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoder: Audio.AndroidAudioEncoder.AAC,
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 128000
          },
          ios: {
            extension: '.m4a',
            outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
            audioQuality: Audio.IOSAudioQuality.HIGH,
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 128000
          },
          web: {
            mimeType: 'audio/mp4',
            bitsPerSecond: 128000
          }
        }

        const { recording } = await Audio.Recording.createAsync(recordingConfig)
        recordingRef.current = recording
        setStatus('listening')
        logger.info('Started audio recording for API provider')
        clearTimeout(timeoutId)
        return true
      }

      // Handle system default provider
      logger.info('Using system default provider')
      const isAvailable = await ExpoSpeechRecognitionModule.isRecognitionAvailable()
      logger.info('Speech recognition available:', isAvailable)

      if (!isAvailable) {
        const errorMsg = 'Speech recognition is not available on this device'
        logger.warn(errorMsg)
        setError(errorMsg)
        onErrorRef.current?.(errorMsg)
        setStatus('idle')
        clearTimeout(timeoutId)
        return false
      }

      // Request permissions
      logger.info('Requesting speech recognition permission...')
      const permissionResult = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
      logger.info('Speech recognition permission granted:', permissionResult.granted)

      if (!permissionResult.granted) {
        const errorMsg = 'Speech recognition permission denied'
        logger.info(errorMsg)
        setError(errorMsg)
        onErrorRef.current?.(errorMsg)
        setStatus('idle')
        clearTimeout(timeoutId)
        return false
      }

      // Clear previous state
      setTranscript('')
      setError(null)

      // Start recognition with configuration
      logger.info('Starting speech recognition with locale:', getRecognitionLocale())
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

      clearTimeout(timeoutId)
      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error starting speech recognition'
      logger.error('Failed to start speech recognition:', err instanceof Error ? err : new Error(String(err)))
      logger.error('Error details:', JSON.stringify(err))
      setError(errorMsg)
      setStatus('idle')
      onErrorRef.current?.(errorMsg)
      clearTimeout(timeoutId)
      return false
    }
  }

  // Stop speech recognition
  const stopListening = async () => {
    try {
      const providers = getSpeechToTextProviders()
      const provider = providers.find(p => p.id === currentProviderId) || providers[0]

      // Handle API providers
      if (provider?.type === 'api' && recordingRef.current) {
        setStatus('processing')

        try {
          // Stop recording
          await recordingRef.current.stopAndUnloadAsync()
          const uri = recordingRef.current.getURI()
          recordingRef.current = null

          if (!uri) {
            throw new Error('Failed to get recording URI')
          }

          logger.info('Recording stopped, processing audio with API provider')

          // Get provider config and create service
          const apiKey = providersConfig?.[provider.id]?.apiKey
          if (!apiKey) {
            throw new Error('API key not configured')
          }

          const providerWithKey = { ...provider, apiKey }
          let result = ''

          if (provider.id === 'bailian') {
            const service = new DashScopeSpeechService(providerWithKey)
            result = await service.recognizeFromFile(uri, { language: getRecognitionLocale().split('-')[0] })
          } else {
            throw new Error(`Unsupported API provider: ${provider.id}`)
          }

          setTranscript(result)
          onTranscriptRef.current?.(result, true)
          setStatus('idle')
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to process audio'
          logger.error('Failed to process audio with API provider:', err instanceof Error ? err : new Error(String(err)))
          setError(errorMsg)
          onErrorRef.current?.(errorMsg)
          setStatus('idle')
        }
        return
      }

      // Handle system default provider
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
  const abortListening = async () => {
    try {
      const providers = getSpeechToTextProviders()
      const provider = providers.find(p => p.id === currentProviderId) || providers[0]

      // Handle API providers
      if (provider?.type === 'api' && recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync()
        recordingRef.current = null
      }

      // Handle system default provider
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
