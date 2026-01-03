import { useState } from 'react'

export interface UseVoiceInputReturn {
  isVoiceActive: boolean
  setIsVoiceActive: (active: boolean) => void
  toggleVoice: () => void
}

/**
 * Hook for managing voice input state
 * Extracted from Root.tsx line 42
 */
export function useVoiceInput(): UseVoiceInputReturn {
  const [isVoiceActive, setIsVoiceActive] = useState(false)

  const toggleVoice = () => {
    setIsVoiceActive(prev => !prev)
  }

  return {
    isVoiceActive,
    setIsVoiceActive,
    toggleVoice
  }
}
