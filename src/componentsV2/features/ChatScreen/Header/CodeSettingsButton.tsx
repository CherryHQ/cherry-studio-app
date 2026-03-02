import React from 'react'

import { IconButton } from '@/componentsV2/base/IconButton'
import { Settings2 } from '@/componentsV2/icons/LucideIcon'

import { presentCodeSettingsSheet } from './CodeSettingsSheet'

export const CodeSettingButton = () => {
  const handleSettingsPress = () => {
    presentCodeSettingsSheet()
  }
  return <IconButton onPress={handleSettingsPress} icon={<Settings2 size={24} />} />
}
