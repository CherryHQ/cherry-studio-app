import { AnimatePresence, MotiView } from 'moti'
import React from 'react'

import { PauseButton, SendButton, VoiceButton } from '../buttons'
import { useMessageInput } from '../context/MessageInputContext'

export const Actions: React.FC = () => {
  const { isLoading, isVoiceActive, text, files, onPause, sendMessage, setText, setIsVoiceActive } = useMessageInput()
  const hasText = text.trim().length > 0
  const hasFiles = files.length > 0
  const shouldShowVoice = isVoiceActive || (!hasText && !hasFiles)

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
          <SendButton onSend={sendMessage} />
        </MotiView>
      )}
    </AnimatePresence>
  )
}
