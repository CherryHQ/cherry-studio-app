import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import { SelectionDropdown, type SelectionDropdownItem, Text } from '@/componentsV2'
import { ChevronsUpDown } from '@/componentsV2/icons'
import { defaultLanguage, languagesOptions } from '@/config/languages'
import { useBuiltInAssistants } from '@/hooks/useAssistant'
import { storage } from '@/utils'

export function LanguageDropdown() {
  const { t, i18n } = useTranslation()
  const [currentLanguage, setCurrentLanguage] = useState<string>(storage.getString('language') || defaultLanguage)
  const { resetBuiltInAssistants } = useBuiltInAssistants()

  const handleLanguageChange = async (langCode: string) => {
    storage.set('language', langCode)
    await i18n.changeLanguage(langCode)
    setCurrentLanguage(langCode)
    resetBuiltInAssistants()
  }

  const languageDropdownOptions: SelectionDropdownItem[] = languagesOptions.map(opt => ({
    id: opt.value,
    label: `${opt.flag} ${opt.label}`,
    isSelected: currentLanguage === opt.value,
    onSelect: () => handleLanguageChange(opt.value)
  }))

  const getCurrentLanguageLabel = () => {
    const current = languagesOptions.find(item => item.value === currentLanguage)
    return current ? `${current.flag} ${current.label}` : '🇺🇸 English'
  }

  return (
    <SelectionDropdown items={languageDropdownOptions}>
      <Pressable className="bg-ui-card-background flex-row items-center gap-2 rounded-xl active:opacity-80">
        <Text className="text-text-secondary text-sm" numberOfLines={1}>
          {getCurrentLanguageLabel()}
        </Text>
        <ChevronsUpDown size={16} className="text-text-secondary" />
      </Pressable>
    </SelectionDropdown>
  )
}
