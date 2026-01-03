import { useEffect, useState } from 'react'

import { type ISheetPresentationService, SheetPresentationService } from '../services/SheetPresentationService'
import type { ModelSheetConfig, ModelSheetState } from '../types'

export const SHEET_NAME = 'global-model-sheet'

// Singleton service instance
const defaultSheetService: ISheetPresentationService = new SheetPresentationService(SHEET_NAME)

/**
 * Present the model sheet with the given configuration
 */
export function presentModelSheet(
  config: ModelSheetConfig,
  service: ISheetPresentationService = defaultSheetService
): Promise<void> {
  return service.present(config)
}

/**
 * Dismiss the model sheet
 */
export function dismissModelSheet(service: ISheetPresentationService = defaultSheetService): Promise<void> {
  return service.dismiss()
}

/**
 * Hook for managing model sheet state
 * Subscribes to the sheet presentation service for updates
 */
export function useModelSheet(service: ISheetPresentationService = defaultSheetService): ModelSheetState {
  const [config, setConfig] = useState<ModelSheetConfig | null>(() => service.getCurrentConfig())
  const [isVisible, setIsVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const unsubscribe = service.subscribe({
      onConfigChange: setConfig,
      onVisibilityChange: setIsVisible
    })
    return unsubscribe
  }, [service])

  const handleDidDismiss = () => {
    setIsVisible(false)
    setSearchQuery('')
    service.notifyVisibilityChange(false)
  }

  const handleDidPresent = () => {
    setIsVisible(true)
    service.notifyVisibilityChange(true)
  }

  return {
    config,
    isVisible,
    searchQuery,
    setSearchQuery,
    handleDidDismiss,
    handleDidPresent
  }
}
