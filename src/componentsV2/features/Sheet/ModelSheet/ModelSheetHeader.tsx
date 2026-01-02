import React from 'react'
import { View } from 'react-native'

import { TOTAL_HEADER_HEIGHT } from './layoutConstants'
import { ModelListHeader } from './ModelListHeader'
import { ModelProviderTabBar } from './ModelProviderTabBar'
import type { SelectOption } from './types'

export { TOTAL_HEADER_HEIGHT }

interface ModelSheetHeaderProps {
  // Search
  searchQuery: string
  onSearchChange: (text: string) => void

  // Multi-select
  multiple: boolean
  isMultiSelectActive: boolean
  onToggleMultiSelect: () => void
  onClearAll: () => void

  // Provider tabs
  selectOptions: SelectOption[]
  activeProvider: string
  onProviderChange: (providerId: string) => void
  bottom: number
}

export const ModelSheetHeader: React.FC<ModelSheetHeaderProps> = ({
  searchQuery,
  onSearchChange,
  multiple,
  isMultiSelectActive,
  onToggleMultiSelect,
  onClearAll,
  selectOptions,
  activeProvider,
  onProviderChange,
  bottom
}) => {
  return (
    <View style={{ height: TOTAL_HEADER_HEIGHT }}>
      <ModelListHeader
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        multiple={multiple}
        isMultiSelectActive={isMultiSelectActive}
        onToggleMultiSelect={onToggleMultiSelect}
        onClearAll={onClearAll}
      />
      <ModelProviderTabBar
        selectOptions={selectOptions}
        activeProvider={activeProvider}
        onProviderChange={onProviderChange}
        bottom={bottom}
      />
    </View>
  )
}
