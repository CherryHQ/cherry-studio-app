import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { delay } from 'lodash'
import type { FC } from 'react'
import React, { useMemo } from 'react'
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

interface ReasoningSheetProps {
  name: string
  model: Model
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

export const presentReasoningSheet = (name: string) => TrueSheet.present(name)
export const dismissReasoningSheet = (name: string) => TrueSheet.dismiss(name)

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

export const ReasoningSheet: FC<ReasoningSheetProps> = ({ name, model, assistant, updateAssistant }) => {
  const { t } = useTranslation()

  // Converted from useMemo to a simple const
  const currentReasoningEffort = assistant.settings?.reasoning_effort || 'off'

  const modelType = getThinkModelType(model)

  // 获取当前模型支持的选项
  const supportedOptions: ThinkingOption[] = useMemo(() => {
    if (modelType === 'doubao') {
      if (isDoubaoThinkingAutoModel(model)) {
        return ['off', 'auto', 'high']
      }

      return ['off', 'high']
    }

    return MODEL_SUPPORTED_OPTIONS[modelType]
  }, [model, modelType])

  const onValueChange = async (option?: ThinkingOption) => {
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
    delay(() => TrueSheet.dismiss(name), 50)
  }

  const sheetOptions: SelectionSheetItem[] = supportedOptions.map(option => ({
    key: option,
    label: t(`assistants.settings.reasoning.${option}`),
    icon: <View className="h-5 w-5">{createThinkingIcon(option)}</View>,
    isSelected: currentReasoningEffort === option,
    onSelect: () => onValueChange(option)
  }))

  return <SelectionSheet name={name} items={sheetOptions} />
}
