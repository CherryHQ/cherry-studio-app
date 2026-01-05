import { cn, Tabs } from 'heroui-native'
import React from 'react'
import { View } from 'react-native'

import { ProviderIcon } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'

import { LAYOUT } from '../constants'
import type { SelectOption } from '../types'

interface ModelProviderTabBarProps {
  selectOptions: SelectOption[]
  activeProvider: string
  onProviderChange: (provider: string) => void
}

export const ModelProviderTabBar: React.FC<ModelProviderTabBarProps> = ({
  selectOptions,
  activeProvider,
  onProviderChange
}) => {
  if (selectOptions.length === 0) {
    return null
  }

  return (
    <View
      className="bg-card  overflow-hidden"
      style={{ paddingHorizontal: LAYOUT.HORIZONTAL_PADDING, height: LAYOUT.TAB_BAR_HEIGHT }}>
      <Tabs value={activeProvider} onValueChange={onProviderChange}>
        <Tabs.ScrollView>
          <Tabs.List aria-label="Provider tabs" className="bg-transparent px-0">
            <Tabs.Indicator className="primary-container rounded-xl border" />
            {selectOptions.map(group => (
              <Tabs.Trigger key={group.label} value={group.label}>
                <XStack className="items-center gap-1.5">
                  <ProviderIcon provider={group.provider} size={18} />
                  <Tabs.Label className={cn(activeProvider === group.label ? 'primary-text' : undefined)}>
                    {group.label}
                  </Tabs.Label>
                </XStack>
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs.ScrollView>
      </Tabs>
    </View>
  )
}
