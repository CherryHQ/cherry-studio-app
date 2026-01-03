import { useEffect, useRef, useState } from 'react'
import type { SectionList as SectionListType, ViewToken } from 'react-native'

import { ANIMATION } from '../constants'
import type { ModelOption, ProviderSection } from '../types'

interface UseModelTabScrollingParams {
  sections: ProviderSection[]
  isVisible: boolean
}

export function useModelTabScrolling({ sections, isVisible }: UseModelTabScrollingParams) {
  const [activeProvider, setActiveProvider] = useState<string>('')
  const listRef = useRef<SectionListType<ModelOption, ProviderSection>>(null)
  const isScrollingByTab = useRef(false)

  // Build provider label -> section index mapping
  const sectionIndices: Record<string, number> = {}
  sections.forEach((section, index) => {
    sectionIndices[section.title] = index
  })

  // Reset activeProvider when sheet is dismissed
  useEffect(() => {
    if (!isVisible) {
      setActiveProvider('')
    }
  }, [isVisible])

  // Viewability config for onViewableItemsChanged
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: ANIMATION.VIEWABILITY_THRESHOLD_PERCENT
  }).current

  // Handle viewable items change - more accurate than scroll position estimation
  const handleViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[]; changed: ViewToken[] }) => {
      if (isScrollingByTab.current || viewableItems.length === 0) return

      // Get the first visible item's section
      const firstViewable = viewableItems[0]
      if (firstViewable?.section) {
        const section = firstViewable.section as ProviderSection
        if (section.title && section.title !== activeProvider) {
          setActiveProvider(section.title)
        }
      }
    }
  ).current

  // Click Tab to scroll to corresponding Provider
  const handleProviderChange = (providerLabel: string) => {
    setActiveProvider(providerLabel)
    isScrollingByTab.current = true

    const sectionIndex = sectionIndices[providerLabel]
    if (listRef.current && sectionIndex !== undefined) {
      listRef.current.scrollToLocation({
        sectionIndex,
        itemIndex: 0,
        animated: true
      })
    }

    // Reset flag after scroll animation completes
    setTimeout(() => {
      isScrollingByTab.current = false
    }, ANIMATION.TAB_SCROLL_TIMEOUT_MS)
  }

  return {
    activeProvider,
    listRef,
    viewabilityConfig,
    onViewableItemsChanged: handleViewableItemsChanged,
    handleProviderChange
  }
}
