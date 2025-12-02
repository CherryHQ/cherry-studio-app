import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { delay } from 'lodash'
import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { SelectionSheetItem } from '@/componentsV2/base/SelectionSheet'
import SelectionSheet from '@/componentsV2/base/SelectionSheet'
import {
  MdiLightbulbAutoOutline,
  MdiLightbulbOffOutline,
  MdiLightbulbOn,
  MdiLightbulbOn30,
  MdiLightbulbOn50,
  MdiLightbulbOn80
} from '@/componentsV2/icons'
import { getThinkModelType, isDoubaoThinkingAutoModel, MODEL_SUPPORTED_OPTIONS } from '@/config/models'
import type { Assistant, Model, ThinkingOption } from '@/types/assistant'

const SHEET_NAME = 'global-reasoning-sheet'

interface ReasoningSheetData {
  model: Model | null
  assistant: Assistant | null
  updateAssistant: ((assistant: Assistant) => Promise<void>) | null
}

const defaultReasoningSheetData: ReasoningSheetData = {
  model: null,
  assistant: null,
  updateAssistant: null
}

let currentSheetData: ReasoningSheetData = defaultReasoningSheetData
let updateSheetDataCallback: ((data: ReasoningSheetData) => void) | null = null

export const presentReasoningSheet = (data: ReasoningSheetData) => {
  currentSheetData = data
  updateSheetDataCallback?.(data)
  return TrueSheet.present(SHEET_NAME)
}

export const dismissReasoningSheet = () => TrueSheet.dismiss(SHEET_NAME)

const createThinkingIcon = (option?: ThinkingOption) => {
  switch (option) {
    case 'minimal':
      return <MdiLightbulbOn30 />
    case 'low':
      return <MdiLightbulbOn50 />
    case 'medium':
      return <MdiLightbulbOn80 />
    case 'high':
      return <MdiLightbulbOn />
    case 'auto':
      return <MdiLightbulbAutoOutline />
    case 'off':
      return <MdiLightbulbOffOutline />
    default:
      return <MdiLightbulbOffOutline />
  }
}

export const ReasoningSheet: React.FC = () => {
  const { t } = useTranslation()
  const [sheetData, setSheetData] = useState<ReasoningSheetData>(currentSheetData)
  const { model, assistant, updateAssistant } = sheetData

  useEffect(() => {
    updateSheetDataCallback = setSheetData
    return () => {
      updateSheetDataCallback = null
    }
  }, [])

  const currentReasoningEffort = assistant?.settings?.reasoning_effort || 'off'
  const modelType = model ? getThinkModelType(model) : null

  const supportedOptions: ThinkingOption[] = useMemo(() => {
    if (!model || !modelType) {
      return []
    }

    if (modelType === 'doubao') {
      if (isDoubaoThinkingAutoModel(model)) {
        return ['off', 'auto', 'high']
      }

      return ['off', 'high']
    }

    return MODEL_SUPPORTED_OPTIONS[modelType]
  }, [model, modelType])

  const onValueChange = async (option?: ThinkingOption) => {
    if (!assistant || !updateAssistant) {
      return
    }

    const isEnabled = option !== undefined && option !== 'off'

    if (!isEnabled) {
      await updateAssistant({
        ...assistant,
        settings: {
          ...assistant.settings,
          reasoning_effort: undefined,
          reasoning_effort_cache: undefined,
          qwenThinkMode: false
        }
      })
    } else {
      await updateAssistant({
        ...assistant,
        settings: {
          ...assistant.settings,
          reasoning_effort: option,
          reasoning_effort_cache: option,
          qwenThinkMode: true
        }
      })
    }

    delay(() => dismissReasoningSheet(), 50)
  }

  const sheetOptions: SelectionSheetItem[] = supportedOptions.map(option => ({
    key: option,
    label: t(`assistants.settings.reasoning.${option}`),
    icon: <View className="h-5 w-5">{createThinkingIcon(option)}</View>,
    isSelected: currentReasoningEffort === option,
    onSelect: () => onValueChange(option)
  }))

  return <SelectionSheet detents={['auto', 0.3]} name={SHEET_NAME} items={sheetOptions} />
}
