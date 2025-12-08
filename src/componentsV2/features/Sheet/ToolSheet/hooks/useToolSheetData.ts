import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { useEffect, useState } from 'react'

import type { ToolSheetData } from '../types'

export const TOOL_SHEET_NAME = 'tool-sheet'

const defaultToolSheetData: ToolSheetData = {
  mentions: [],
  files: [],
  setFiles: () => {},
  assistant: null,
  updateAssistant: null
}

let currentSheetData: ToolSheetData = defaultToolSheetData
let updateSheetDataCallback: ((data: ToolSheetData) => void) | null = null

export const presentToolSheet = (data: ToolSheetData) => {
  currentSheetData = data
  updateSheetDataCallback?.(data)
  return TrueSheet.present(TOOL_SHEET_NAME)
}

export const dismissToolSheet = () => TrueSheet.dismiss(TOOL_SHEET_NAME)

export function useToolSheetData() {
  const [sheetData, setSheetData] = useState<ToolSheetData>(currentSheetData)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    updateSheetDataCallback = setSheetData
    return () => {
      updateSheetDataCallback = null
    }
  }, [])

  const handleDidDismiss = () => {
    setIsVisible(false)
  }

  const handleDidPresent = () => {
    setIsVisible(true)
  }

  return {
    sheetData,
    isVisible,
    handleDidDismiss,
    handleDidPresent
  }
}
