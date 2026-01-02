import { useCallback, useMemo, useState } from 'react'

import { loggerService } from '@/services/LoggerService'

import { LAYOUT } from '../layoutConstants'
import type { ProviderSection } from '../types'

const logger = loggerService.withContext('useBlankSize')

// Destructure layout constants for convenience
const {
  SECTION_HEADER: { HEIGHT: SECTION_HEADER_HEIGHT, MARGIN_TOP: SECTION_HEADER_MARGIN_TOP },
  ITEM: { HEIGHT: ITEM_HEIGHT, SEPARATOR: ITEM_SEPARATOR },
  SECTION_SEPARATOR
} = LAYOUT

interface UseBlankSizeParams {
  sections: ProviderSection[]
  containerHeight: number
  safeAreaBottom: number
}

interface UseBlankSizeReturn {
  blankSize: number
  setActiveSection: (providerId: string | null) => void
  needsBlankSize: (providerId: string) => boolean
}

/**
 * Calculates blank size needed for scrolling last sections to the top of the container.
 *
 * Usage pattern:
 * 1. Call `needsBlankSize(providerId)` to check if blank space is needed
 * 2. If true, call `setActiveSection(providerId)` to activate blank sizing
 * 3. Wait for React render (use InteractionManager.runAfterInteractions)
 * 4. Then scroll to the section - `blankSize` will now have the correct value
 * 5. Call `setActiveSection(null)` when scrolling to sections that don't need blank size
 */
export function useBlankSize({ sections, containerHeight, safeAreaBottom }: UseBlankSizeParams): UseBlankSizeReturn {
  const [activeSection, setActiveSection] = useState<string | null>(null)

  // Pre-calculate each section's height based on item count
  // NOTE: Uses provider.id as key for uniqueness
  const sectionHeights = useMemo(() => {
    const heights: Record<string, number> = {}

    sections.forEach((section, idx) => {
      const isFirstSection = idx === 0
      const headerHeight = SECTION_HEADER_HEIGHT + (isFirstSection ? 0 : SECTION_HEADER_MARGIN_TOP)
      const itemCount = section.data.length
      const itemsHeight = itemCount * ITEM_HEIGHT + Math.max(0, itemCount - 1) * ITEM_SEPARATOR
      const sectionSeparator = idx < sections.length - 1 ? SECTION_SEPARATOR : 0

      heights[section.provider.id] = headerHeight + itemsHeight + sectionSeparator
    })

    return heights
  }, [sections])

  // Calculate offset from each section's start to end of content
  const offsetsFromEnd = useMemo(() => {
    const offsets: Record<string, number> = {}
    let cumulative = safeAreaBottom

    // Iterate from last to first section
    for (let i = sections.length - 1; i >= 0; i--) {
      const section = sections[i]
      const providerId = section.provider.id
      const height = sectionHeights[providerId]
      if (height === undefined) {
        logger.warn('Missing section height', { providerId, sectionIndex: i })
      }
      cumulative += height ?? 0
      offsets[providerId] = cumulative
    }

    return offsets
  }, [sections, sectionHeights, safeAreaBottom])

  // Calculate blank size for the active section
  // Maximum blank size = containerHeight - lastSectionHeight (so last item touches bottom)
  const blankSize = useMemo(() => {
    if (!activeSection || containerHeight <= 0) return 0

    const offsetFromEnd = offsetsFromEnd[activeSection]
    if (offsetFromEnd === undefined) {
      logger.warn('Active section not found in offsets', { activeSection })
      return 0
    }
    const required = containerHeight - offsetFromEnd

    return Math.max(0, required)
  }, [activeSection, containerHeight, offsetsFromEnd])

  // Check if a section needs blank size to scroll to top
  const needsBlankSize = useCallback(
    (providerId: string) => {
      if (containerHeight <= 0) return false
      const offsetFromEnd = offsetsFromEnd[providerId]
      if (offsetFromEnd === undefined) {
        logger.warn('Section not found in offsets', { providerId })
        return false
      }
      return offsetFromEnd < containerHeight
    },
    [offsetsFromEnd, containerHeight]
  )

  return {
    blankSize,
    setActiveSection,
    needsBlankSize
  }
}
