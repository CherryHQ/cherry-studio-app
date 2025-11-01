import { ImpactFeedbackStyle } from 'expo-haptics'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Text } from '@/componentsV2'
import { haptic } from '@/utils/haptic'

type UseTypewriterOptions = {
  text: string | string[]
  speed?: number
  onComplete?: () => void
}

type UseTypewriterResult = {
  displayedText: string
  restart: () => void
}

const useTypewriter = ({ text, speed = 60, onComplete }: UseTypewriterOptions): UseTypewriterResult => {
  const postMessageDelay = 500
  const [displayedText, setDisplayedText] = useState('')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const indexRef = useRef(0)
  const messageIndexRef = useRef(0)
  const normalizedMessages = useMemo(() => {
    if (Array.isArray(text)) {
      return text.filter(message => typeof message === 'string') as string[]
    }
    if (typeof text === 'string' && text.length > 0) {
      return [text]
    }
    return []
  }, [text])
  const messagesRef = useRef<string[]>(normalizedMessages)
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    messagesRef.current = normalizedMessages
  }, [normalizedMessages])

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const startTyping = useCallback(() => {
    clearTimer()
    indexRef.current = 0
    messageIndexRef.current = 0
    setDisplayedText('')

    const messages = messagesRef.current

    if (messages.length === 0) {
      onCompleteRef.current?.()
      return
    }

    const typeCurrentMessage = () => {
      const currentMessages = messagesRef.current

      if (currentMessages.length === 0) {
        setDisplayedText('')
        onCompleteRef.current?.()
        return
      }

      if (messageIndexRef.current >= currentMessages.length) {
        onCompleteRef.current?.()
        messageIndexRef.current = 0
        indexRef.current = 0
        setDisplayedText('')
        timeoutRef.current = setTimeout(typeCurrentMessage, postMessageDelay)
        return
      }

      const currentMessage = currentMessages[messageIndexRef.current] ?? ''

      if (currentMessage.length === 0) {
        messageIndexRef.current += 1
        indexRef.current = 0
        setDisplayedText('')
        timeoutRef.current = setTimeout(typeCurrentMessage, Math.max(speed, 120))
        return
      }

      const tick = () => {
        indexRef.current += 1
        setDisplayedText(currentMessage.slice(0, indexRef.current))
        haptic(ImpactFeedbackStyle.Soft)

        if (indexRef.current >= currentMessage.length) {
          timeoutRef.current = setTimeout(() => {
            setDisplayedText('')
            indexRef.current = 0
            messageIndexRef.current += 1
            typeCurrentMessage()
          }, postMessageDelay)
          return
        }

        timeoutRef.current = setTimeout(tick, speed)
      }

      timeoutRef.current = setTimeout(tick, speed)
    }

    typeCurrentMessage()
  }, [clearTimer, speed])

  useEffect(() => {
    startTyping()

    return () => {
      clearTimer()
    }
  }, [startTyping, clearTimer, normalizedMessages])

  return {
    displayedText,
    restart: startTyping
  }
}

type WelcomeTitleProps = Omit<React.ComponentProps<typeof Text>, 'children'> & {
  speed?: number
}

export default function WelcomeTitle({ speed = 60, ...textProps }: WelcomeTitleProps) {
  const { t } = useTranslation()

  const welcomeMessages = useMemo(() => {
    return [t('common.welcome.message1'), t('common.welcome.message2')]
  }, [t])

  const { displayedText } = useTypewriter({ text: welcomeMessages, speed })

  return <Text {...textProps}>{displayedText}</Text>
}
