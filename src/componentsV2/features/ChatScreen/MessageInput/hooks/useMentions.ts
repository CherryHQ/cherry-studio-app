import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useState } from 'react'

import { useAllProviders } from '@/hooks/useProviders'
import type { Assistant, Model } from '@/types/assistant'

import { getInitialMentions, handleModelChange, validateMentions } from '../services'

export interface UseMentionsOptions {
  topicId: string
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

export interface UseMentionsReturn {
  mentions: Model[]
  setMentions: Dispatch<SetStateAction<Model[]>>
  handleMentionChange: (models: Model[]) => Promise<void>
}

/**
 * Hook for managing model mentions
 * Extracted from useMessageInputLogic lines 71-98
 */
export function useMentions(options: UseMentionsOptions): UseMentionsReturn {
  const { topicId, assistant, updateAssistant } = options
  const [mentions, setMentions] = useState<Model[]>([])
  const { providers, isLoading } = useAllProviders()

  // Initialize mentions when topic changes
  useEffect(() => {
    setMentions(getInitialMentions(assistant))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId])

  // Sync mentions with available models from providers
  useEffect(() => {
    if (isLoading || mentions.length === 0) return

    const { validMentions, removedCount } = validateMentions(mentions, providers)

    // Update mentions if any were removed
    if (removedCount > 0) {
      setMentions(validMentions)
    }
  }, [providers, mentions, isLoading])

  const handleMentionChange = async (models: Model[]) => {
    setMentions(models)
    await handleModelChange(models, assistant, updateAssistant)
  }

  return {
    mentions,
    setMentions,
    handleMentionChange
  }
}
