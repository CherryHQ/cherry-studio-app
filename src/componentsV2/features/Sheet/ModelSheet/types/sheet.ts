import type { Model } from '@/types/assistant'

import type { ModelFilterFn } from '../services/ModelFilterService'

/**
 * Configuration passed to presentModelSheet
 */
export interface ModelSheetConfig {
  mentions: Model[]
  setMentions: (mentions: Model[], isMultiSelectActive?: boolean) => Promise<void> | void
  multiple?: boolean
  filterFn?: ModelFilterFn
}

/**
 * Internal sheet state managed by useModelSheet hook
 */
export interface ModelSheetState {
  config: ModelSheetConfig | null
  isVisible: boolean
  searchQuery: string
  setSearchQuery: (query: string) => void
  handleDidDismiss: () => void
  handleDidPresent: () => void
}

/**
 * Sheet subscriber interface for the presentation service
 */
export interface SheetSubscriber {
  onConfigChange: (config: ModelSheetConfig | null) => void
  onVisibilityChange: (isVisible: boolean) => void
}
