import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { useEffect, useState } from 'react'

import type { ModelSheetData } from '../types'

export const SHEET_NAME = 'global-model-sheet'

const defaultModelSheetData: ModelSheetData = {
  mentions: [],
  setMentions: async () => {},
  multiple: false
}

type SheetDataListener = (data: ModelSheetData) => void

// Module-level state with multi-subscriber support
let sheetData: ModelSheetData = defaultModelSheetData
const listeners = new Set<SheetDataListener>()

/**
 * Notify all subscribers of state change.
 */
const notifyListeners = () => {
  listeners.forEach(fn => fn(sheetData))
}

/**
 * Present the model sheet with data.
 * API compatible with existing usage.
 */
export const presentModelSheet = (data: ModelSheetData) => {
  sheetData = data
  notifyListeners()
  return TrueSheet.present(SHEET_NAME)
}

/**
 * Dismiss the model sheet.
 */
export const dismissModelSheet = () => TrueSheet.dismiss(SHEET_NAME)

/**
 * Hook to access model sheet data.
 * Supports multiple subscribers.
 */
export function useModelSheetData() {
  const [localSheetData, setLocalSheetData] = useState(sheetData)
  const [isVisible, setIsVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Subscribe to data changes
  useEffect(() => {
    listeners.add(setLocalSheetData)
    return () => {
      listeners.delete(setLocalSheetData)
    }
  }, [])

  const handleDidDismiss = () => {
    setIsVisible(false)
    setSearchQuery('')
  }

  const handleDidPresent = () => {
    setIsVisible(true)
  }

  return {
    sheetData: localSheetData,
    isVisible,
    searchQuery,
    setSearchQuery,
    handleDidDismiss,
    handleDidPresent
  }
}
