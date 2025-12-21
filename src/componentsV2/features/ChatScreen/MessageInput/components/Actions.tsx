import { AnimatePresence, MotiView } from 'moti'
import React from 'react'

import { useMessageInput } from '../context/MessageInputContext'
import { PauseButton } from '../PauseButton'
import { SendButton } from '../SendButton'
import { VoiceButton } from '../VoiceButton'

export const Actions: React.FC = () => {
  const { isLoading, isVoiceActive, text, onPause, sendMessage, setText, setIsVoiceActive } = useMessageInput()

  const shouldShowVoice = isVoiceActive || !text

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
