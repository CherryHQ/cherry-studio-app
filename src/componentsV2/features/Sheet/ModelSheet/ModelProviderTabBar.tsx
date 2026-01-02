import { cn, Tabs } from 'heroui-native'
import React from 'react'
import { View } from 'react-native'

import { ProviderIcon } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'

import type { SelectOption } from './types'

interface ModelProviderTabBarProps {
  selectOptions: SelectOption[]
  activeProvider: string
  onProviderChange: (provider: string) => void
  bottom: number
}
export const TAB_BAR_HEIGHT = 48

export const ModelProviderTabBar: React.FC<ModelProviderTabBarProps> = ({
  selectOptions,
  activeProvider,
  onProviderChange
}) => {
  if (selectOptions.length === 0) {
    return null
  }

  return (
    <View className="bg-card overflow-hidden" style={{ paddingHorizontal: 10, height: TAB_BAR_HEIGHT }}>
      <Tabs value={activeProvider} onValueChange={onProviderChange}>
        <Tabs.ScrollView>
          <Tabs.List aria-label="Provider tabs" className="bg-transparent px-0">
            <Tabs.Indicator className="primary-container rounded-xl border" />
            {selectOptions.map(group => (
              <Tabs.Trigger key={group.provider.id} value={group.provider.id}>
                <XStack className="items-center gap-1.5">
                  <ProviderIcon provider={group.provider} size={18} />
                  <Tabs.Label className={cn(activeProvider === group.provider.id ? 'primary-text' : undefined)}>
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
