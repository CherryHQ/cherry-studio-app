import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { useEffect, useState } from 'react'

import type { ModelSheetData } from '../types'

export const SHEET_NAME = 'global-model-sheet'

const defaultModelSheetData: ModelSheetData = {
  mentions: [],
  setMentions: async () => {},
  multiple: false
}

let currentSheetData: ModelSheetData = defaultModelSheetData
let updateSheetDataCallback: ((data: ModelSheetData) => void) | null = null

export const presentModelSheet = (data: ModelSheetData) => {
  currentSheetData = data
  updateSheetDataCallback?.(data)
  return TrueSheet.present(SHEET_NAME)
}

export const dismissModelSheet = () => TrueSheet.dismiss(SHEET_NAME)

export function useModelSheetData() {
  const [sheetData, setSheetData] = useState<ModelSheetData>(currentSheetData)
  const [isVisible, setIsVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    updateSheetDataCallback = setSheetData
    return () => {
      updateSheetDataCallback = null
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
    sheetData,
    isVisible,
    searchQuery,
    setSearchQuery,
    handleDidDismiss,
    handleDidPresent
  }
}
