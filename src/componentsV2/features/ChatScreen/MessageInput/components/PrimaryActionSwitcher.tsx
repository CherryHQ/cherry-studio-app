import { AnimatePresence, MotiView } from 'moti'
import React from 'react'

import XStack from '@/componentsV2/layout/XStack'

import { PauseButton } from '../PauseButton'
import { SendButton } from '../SendButton'
import { VoiceButton } from '../VoiceButton'

interface PrimaryActionSwitcherProps {
  isTopicLoading: boolean
  isVoiceActive: boolean
  hasText: boolean
  onPause: () => void | Promise<void>
  onSend: () => void | Promise<void>
  onTranscript: (text: string) => void
  onVoiceActiveChange: (active: boolean) => void
}

export const PrimaryActionSwitcher: React.FC<PrimaryActionSwitcherProps> = ({
  isTopicLoading,
  isVoiceActive,
  hasText,
  onPause,
  onSend,
  onTranscript,
  onVoiceActiveChange
}) => {
  const shouldShowVoice = isVoiceActive || !hasText

  return (
    <XStack className="h-[42px] items-center justify-center gap-2.5">
      <AnimatePresence exitBeforeEnter>
        {isTopicLoading ? (
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
            <VoiceButton onTranscript={onTranscript} onListeningChange={onVoiceActiveChange} />
          </MotiView>
        ) : (
          <MotiView
            key="send-button"
            from={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: 'timing', duration: 200 }}>
            <SendButton onSend={onSend} />
          </MotiView>
        )}
      </AnimatePresence>
    </XStack>
  )
}
