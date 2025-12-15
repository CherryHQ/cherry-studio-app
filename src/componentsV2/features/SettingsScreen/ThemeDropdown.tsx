import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'
import { Uniwind } from 'uniwind'

import SelectionDropdown, { type SelectionDropdownItem } from '@/componentsV2/base/SelectionDropdown'
import Text from '@/componentsV2/base/Text'
import { ChevronsUpDown, Palette } from '@/componentsV2/icons'
import { themeOptions } from '@/config/theme'
import { useSettings } from '@/hooks/useSettings'
import { ThemeMode } from '@/types'

export function ThemeDropdown() {
  const { t } = useTranslation()
  const { theme: currentTheme, setTheme } = useSettings()

  const handleThemeChange = (theme: ThemeMode) => {
    setTheme(theme)
    Uniwind.setTheme(theme === ThemeMode.system ? 'system' : theme)
  }

  const themeDropdownOptions: SelectionDropdownItem[] = themeOptions.map(opt => ({
    id: opt.value,
    label: t(opt.label),
    isSelected: currentTheme === opt.value,
    onSelect: () => handleThemeChange(opt.value)
  }))

  const getCurrentThemeLabel = () => {
    const current = themeOptions.find(item => item.value === currentTheme)
    return current ? t(current.label) : t('settings.general.theme.auto')
  }

  return (
    <SelectionDropdown items={themeDropdownOptions}>
      <Pressable className="bg-card flex-row items-center gap-2 rounded-xl active:opacity-80">
        <Palette className="text-foreground-secondary" size={18} />
        <Text className="text-foreground-secondary text-sm" numberOfLines={1}>
          {getCurrentThemeLabel()}
        </Text>
        <ChevronsUpDown size={16} className="text-foreground-secondary" />
      </Pressable>
    </SelectionDropdown>
  )
}
