import type { TFunction } from 'i18next'
import { useCallback, useMemo, useState } from 'react'
import { InteractionManager } from 'react-native'

import type { Provider } from '@/types/assistant'

import { buildSections, buildSelectOptions, getAllModelOptions } from '../modelSheetData'
import type { ModelOption, ProviderSection, SelectOption } from '../types'
import { useBlankSize } from './useBlankSize'
import { useModelSelection } from './useModelSelection'
import { useModelSheetData } from './useModelSheetData'
import { useModelTabScrolling } from './useModelTabScrolling'

interface UseModelSheetControllerParams {
  providers: Provider[]
  bottom: number
  t: TFunction
}

interface ModelSheetControllerOutput {
  // Data
  sections: ProviderSection[]
  selectOptions: SelectOption[]
  allModelOptions: ModelOption[]

  // Sheet data
  sheetData: ReturnType<typeof useModelSheetData>['sheetData']
  isVisible: boolean
  searchQuery: string
  setSearchQuery: (query: string) => void

  // Selection state
  selectedModels: string[]
  isMultiSelectActive: boolean
  handleModelToggle: (modelValue: string) => void
  handleClearAll: () => void
  toggleMultiSelectMode: () => void

  // Tab scrolling
  activeProvider: string
  listRef: ReturnType<typeof useModelTabScrolling>['listRef']
  viewabilityConfig: ReturnType<typeof useModelTabScrolling>['viewabilityConfig']
  onViewableItemsChanged: ReturnType<typeof useModelTabScrolling>['onViewableItemsChanged']
  handleProviderChangeWithBlank: (providerId: string) => void

  // Layout
  blankSize: number
  containerHeight: number
  onContainerLayout: (height: number) => void

  // Sheet callbacks
  handleDidDismiss: () => void
  handleDidPresent: () => void
}

/**
 * Controller hook that orchestrates all ModelSheet state and logic.
 * Centralizes data flow and reduces index.tsx complexity.
 */
export function useModelSheetController({
  providers,
  bottom,
  t
}: UseModelSheetControllerParams): ModelSheetControllerOutput {
  // Sheet data management
  const { sheetData, isVisible, searchQuery, setSearchQuery, handleDidDismiss, handleDidPresent } = useModelSheetData()
  const { mentions, setMentions } = sheetData

  // Build model options from providers
  const selectOptions = useMemo(
    () => buildSelectOptions(providers, searchQuery, t),
    [providers, searchQuery, t]
  )

  const allModelOptions = useMemo(() => getAllModelOptions(selectOptions), [selectOptions])

  // SectionList data structure
  const sections = useMemo(() => buildSections(selectOptions), [selectOptions])

  // Model selection
  const { selectedModels, isMultiSelectActive, handleModelToggle, handleClearAll, toggleMultiSelectMode } =
    useModelSelection({
      mentions,
      allModelOptions,
      setMentions
    })

  // Tab scrolling
  const { activeProvider, listRef, viewabilityConfig, onViewableItemsChanged, handleProviderChange } =
    useModelTabScrolling({
      sections,
      isVisible
    })

  // Blank size for scrolling last sections to top
  const [containerHeight, setContainerHeight] = useState(0)
  const { blankSize, needsBlankSize, setActiveSection } = useBlankSize({
    sections,
    containerHeight,
    safeAreaBottom: bottom
  })

  // Wrapped handler that applies blank size before scrolling
  const handleProviderChangeWithBlank = useCallback(
    (providerId: string) => {
      if (needsBlankSize(providerId)) {
        setActiveSection(providerId)
        InteractionManager.runAfterInteractions(() => handleProviderChange(providerId))
      } else {
        setActiveSection(null)
        handleProviderChange(providerId)
      }
    },
    [needsBlankSize, setActiveSection, handleProviderChange]
  )

  const onContainerLayout = useCallback((height: number) => {
    if (Number.isFinite(height) && height > 0) {
      setContainerHeight(height)
    }
  }, [])

  return {
    // Data
    sections,
    selectOptions,
    allModelOptions,

    // Sheet data
    sheetData,
    isVisible,
    searchQuery,
    setSearchQuery,

    // Selection
    selectedModels,
    isMultiSelectActive,
    handleModelToggle,
    handleClearAll,
    toggleMultiSelectMode,

    // Tab scrolling
    activeProvider,
    listRef,
    viewabilityConfig,
    onViewableItemsChanged,
    handleProviderChangeWithBlank,

    // Layout
    blankSize,
    containerHeight,
    onContainerLayout,

    // Sheet callbacks
    handleDidDismiss,
    handleDidPresent
  }
}
