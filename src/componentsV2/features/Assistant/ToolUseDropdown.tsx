import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import { SelectionDropdown, type SelectionDropdownItem } from '@/componentsV2'
import Text from '@/componentsV2/base/Text'
import { ChevronsUpDown, SquareFunction, Wrench } from '@/componentsV2/icons'
import type { Assistant } from '@/types/assistant'

interface ToolUseDropdownProps {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

export function ToolUseDropdown({ assistant, updateAssistant }: ToolUseDropdownProps) {
  const { t } = useTranslation()

  const handleToolUseModeToggle = async (mode: 'function' | 'prompt') => {
    const newToolUseMode = mode === assistant.settings?.toolUseMode ? undefined : mode
    await updateAssistant({
      ...assistant,
      settings: {
        ...assistant.settings,
        toolUseMode: newToolUseMode
      }
    })
  }

  const toolUseOptions: SelectionDropdownItem[] = [
    {
      id: 'function',
      label: t('assistants.settings.tooluse.function'),
      icon: <SquareFunction size={20} />,
      isSelected: assistant.settings?.toolUseMode === 'function',
      onSelect: () => handleToolUseModeToggle('function')
    },
    {
      id: 'prompt',
      label: t('assistants.settings.tooluse.prompt'),
      icon: <Wrench size={20} />,
      isSelected: assistant.settings?.toolUseMode === 'prompt',
      onSelect: () => handleToolUseModeToggle('prompt')
    }
  ]

  return (
    <SelectionDropdown items={toolUseOptions}>
      <Pressable className="bg-ui-card-background flex-row items-center gap-2 rounded-xl  active:opacity-80">
        {assistant.settings?.toolUseMode ? (
          <>
            {assistant.settings.toolUseMode === 'function' ? (
              <SquareFunction className="text-text-secondary dark:text-text-secondary" size={18} />
            ) : (
              <Wrench className="text-text-secondary dark:text-text-secondary" size={18} />
            )}
            <Text className="text-text-secondary text-sm" numberOfLines={1}>
              {t(`assistants.settings.tooluse.${assistant.settings?.toolUseMode}`)}
            </Text>
          </>
        ) : (
          <Text className="text-text-secondary text-sm" numberOfLines={1}>
            {t('assistants.settings.tooluse.empty')}
          </Text>
        )}
        <ChevronsUpDown size={16} className="text-text-secondary dark:text-text-secondary" />
      </Pressable>
    </SelectionDropdown>
  )
}
