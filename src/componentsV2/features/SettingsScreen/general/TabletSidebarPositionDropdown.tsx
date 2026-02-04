import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import SelectionDropdown, { type SelectionDropdownItem } from '@/componentsV2/base/SelectionDropdown'
import Text from '@/componentsV2/base/Text'
import { ChevronsUpDown, PanelLeft, PanelRight } from '@/componentsV2/icons'
import { usePreference } from '@/hooks/usePreference'
import type { TabletSidebarPosition } from '@/shared/data/preference/preferenceTypes'

const positionOptions: { value: TabletSidebarPosition; labelKey: string; icon: React.ReactNode }[] = [
  { value: 'left', labelKey: 'settings.general.tablet_sidebar.left', icon: <PanelLeft size={18} /> },
  { value: 'right', labelKey: 'settings.general.tablet_sidebar.right', icon: <PanelRight size={18} /> }
]

export function TabletSidebarPositionDropdown() {
  const { t } = useTranslation()
  const [currentPosition, setCurrentPosition] = usePreference('ui.tablet_sidebar_position')

  const handlePositionChange = (position: TabletSidebarPosition) => {
    setCurrentPosition(position)
  }

  const positionDropdownOptions: SelectionDropdownItem[] = positionOptions.map(opt => ({
    id: opt.value,
    label: t(opt.labelKey),
    icon: opt.icon,
    isSelected: currentPosition === opt.value,
    onSelect: () => handlePositionChange(opt.value)
  }))

  const getCurrentPositionLabel = () => {
    const current = positionOptions.find(item => item.value === currentPosition)
    return current ? t(current.labelKey) : t('settings.general.tablet_sidebar.left')
  }

  return (
    <SelectionDropdown items={positionDropdownOptions}>
      <Pressable className="bg-card flex-row items-center gap-2 rounded-xl active:opacity-80">
        <Text className="text-foreground-secondary text-sm" numberOfLines={1}>
          {getCurrentPositionLabel()}
        </Text>
        <ChevronsUpDown size={16} className="text-foreground-secondary" />
      </Pressable>
    </SelectionDropdown>
  )
}
