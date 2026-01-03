import { loggerService } from '@/services/LoggerService'
import type { Assistant, Model, Provider } from '@/types/assistant'
import { getModelUniqId } from '@/utils/model'

import type { MentionValidationResult, MessageInputResult } from '../types'
import { createErrorResult, createSuccessResult } from '../types'

const logger = loggerService.withContext('MentionValidationService')

/**
 * Validate mentions against available providers
 * Returns valid mentions and count of removed invalid ones
 */
export function validateMentions(mentions: Model[], providers: Provider[]): MentionValidationResult {
  if (mentions.length === 0) {
    return { validMentions: [], removedCount: 0 }
  }

  // Build a set of all available model unique IDs
  const availableModelIds = new Set<string>()
  providers.forEach(provider => {
    if (provider.enabled && provider.models) {
      provider.models.forEach(model => {
        availableModelIds.add(getModelUniqId(model))
      })
    }
  })

  // Filter out mentions that are no longer available
  const validMentions = mentions.filter(mention => availableModelIds.has(getModelUniqId(mention)))

  const removedCount = mentions.length - validMentions.length
  if (removedCount > 0) {
    logger.info(`Removed ${removedCount} invalid model(s) from mentions`)
  }

  return { validMentions, removedCount }
}

/**
 * Get initial mentions for a topic based on assistant model
 */
export function getInitialMentions(assistant: Assistant): Model[] {
  if (assistant.model) {
    return [assistant.model]
  }
  if (assistant.defaultModel) {
    return [assistant.defaultModel]
  }
  return []
}

/**
 * Handle model change with assistant update logic
 * Extracted from MentionButton
 */
export async function handleModelChange(
  models: Model[],
  assistant: Assistant,
  updateAssistant: (assistant: Assistant) => Promise<void>
): Promise<MessageInputResult> {
  if (models.length === 0) {
    return createSuccessResult()
  }

  try {
    const updatedAssistant: Assistant = { ...assistant }

    if (assistant.defaultModel) {
      // Has defaultModel: only update model
      updatedAssistant.model = models[0]
    } else {
      // No defaultModel: set both
      updatedAssistant.defaultModel = models[0]
      updatedAssistant.model = models[0]
    }

    await updateAssistant(updatedAssistant)
    return createSuccessResult()
  } catch (error) {
    logger.error('Error updating model:', error)
    return createErrorResult(
      'mention_validation',
      error instanceof Error ? error.message : 'Unknown error',
      'error.model.update_failed'
    )
  }
}
