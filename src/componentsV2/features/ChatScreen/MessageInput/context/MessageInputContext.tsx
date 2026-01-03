import { createContext, useContext } from 'react'

import type { MessageInputContextValue } from '../types'

export type { MessageInputContextValue }

export const MessageInputContext = createContext<MessageInputContextValue | null>(null)

export const useMessageInput = () => {
  const context = useContext(MessageInputContext)
  if (!context) {
    throw new Error('useMessageInput must be used within MessageInput')
  }
  return context
}
