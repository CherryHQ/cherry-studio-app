import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import { delay } from 'lodash'
import type { FC } from 'react'
import React from 'react'
import { useTranslation } from 'react-i18next'

import type { SelectionSheetItem } from '@/componentsV2/base/SelectionSheet'
import SelectionSheet from '@/componentsV2/base/SelectionSheet'
import { SquareFunction, Wrench } from '@/componentsV2/icons/LucideIcon'
import type { Assistant } from '@/types/assistant'

interface ToolUseSheetProps {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
  ref: React.RefObject<BottomSheetModal | null>
}

export const ToolUseSheet: FC<ToolUseSheetProps> = ({ assistant, updateAssistant, ref }) => {
  const { t } = useTranslation()

  const toolUseOptions: SelectionSheetItem[] = [
    {
      id: 'function',
      label: t('assistants.settings.tooluse.function'),
      icon: (isSelected: boolean) => (
        <SquareFunction size={20} className={isSelected ? 'text-green-100' : 'text-text-primary'} />
      ),
      isSelected: assistant.settings?.toolUseMode === 'function',
      onSelect: () => handleToolUseModeToggle('function')
    },
    {
      id: 'prompt',
      label: t('assistants.settings.tooluse.prompt'),
      icon: (isSelected: boolean) => (
        <Wrench size={20} className={isSelected ? 'text-green-100' : 'text-text-primary'} />
      ),
      isSelected: assistant.settings?.toolUseMode === 'prompt',
      onSelect: () => handleToolUseModeToggle('prompt')
    }
  ]

  const handleToolUseModeToggle = async (mode: 'function' | 'prompt') => {
    const newToolUseMode = mode === assistant.settings?.toolUseMode ? undefined : mode
    await updateAssistant({
      ...assistant,
      settings: {
        ...assistant.settings,
        toolUseMode: newToolUseMode
      }
    })
    delay(() => ref.current?.dismiss(), 50)
  }

  return <SelectionSheet items={toolUseOptions} ref={ref} />
}
