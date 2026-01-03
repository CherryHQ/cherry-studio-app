import { AnimatePresence, MotiView } from 'moti'
import React from 'react'

import { loggerService } from '@/services/LoggerService'

import { PauseButton, SendButton, VoiceButton } from '../buttons'
import { useMessageInput } from '../context/MessageInputContext'

const logger = loggerService.withContext('Actions')

export const Actions: React.FC = () => {
  const { isLoading, isVoiceActive, text, files, onPause, sendMessage, setText, setIsVoiceActive } = useMessageInput()
  const hasText = text.trim().length > 0
  const hasFiles = files.length > 0
  const shouldShowVoice = isVoiceActive || (!hasText && !hasFiles)

  // Pass text directly to bypass any stale closure issues
  // Note: React Compiler handles memoization automatically
  const handleSend = () => {
    logger.info('Actions.handleSend called', { textLength: text.length, hasText, hasFiles })
    sendMessage(text).catch(error => {
      logger.error('Unhandled error in handleSend:', error)
    })
  }

  return (
    <AnimatePresence exitBeforeEnter>
      {isLoading ? (
        <MotiView
          key="pause-button"
          from={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ type: 'timing', duration: 200 }}>
          <PauseButton onPause={onPause} />
        </MotiView>
      ) : shouldShowVoice ? (
        <MotiView
          key="voice-button"
          from={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ type: 'timing', duration: 200 }}>
          <VoiceButton onTranscript={setText} onListeningChange={setIsVoiceActive} />
        </MotiView>
      ) : (
        <MotiView
          key="send-button"
          from={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ type: 'timing', duration: 200 }}>
          <SendButton onSend={handleSend} />
        </MotiView>
      )}
    </AnimatePresence>
  )
}
