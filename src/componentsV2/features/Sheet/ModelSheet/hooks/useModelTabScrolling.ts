import { useEffect, useMemo, useRef, useState } from 'react'
import type { SectionList as SectionListType, ViewToken } from 'react-native'

import type { ModelOption, ProviderSection } from '../types'

interface UseModelTabScrollingParams {
  sections: ProviderSection[]
  isVisible: boolean
}

export function useModelTabScrolling({ sections, isVisible }: UseModelTabScrollingParams) {
  const [activeProvider, setActiveProvider] = useState<string>('')
  const listRef = useRef<SectionListType<ModelOption, ProviderSection>>(null)
  const isScrollingByTab = useRef(false)

  // Build provider id -> section index mapping
  const sectionIndices = useMemo(() => {
    const indices: Record<string, number> = {}
    sections.forEach((section, index) => {
      indices[section.provider.id] = index
    })
    return indices
  }, [sections])

  // Reset activeProvider when sheet is dismissed
  useEffect(() => {
    if (!isVisible) {
      setActiveProvider('')
    }
  }, [isVisible])

  // Viewability config for onViewableItemsChanged
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50
  }).current

  // Handle viewable items change - more accurate than scroll position estimation
  const handleViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[]; changed: ViewToken[] }) => {
      if (isScrollingByTab.current || viewableItems.length === 0) return

      // Get the first visible item's section
      const firstViewable = viewableItems[0]
      if (firstViewable?.section) {
        const section = firstViewable.section as ProviderSection
        const providerId = section.provider.id
        if (providerId && providerId !== activeProvider) {
          setActiveProvider(providerId)
        }
      }
    }
  ).current

  // Click Tab to scroll to corresponding Provider
  const handleProviderChange = (providerId: string) => {
    setActiveProvider(providerId)
    isScrollingByTab.current = true

    const sectionIndex = sectionIndices[providerId]
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
    }, 500)
  }

  return {
    activeProvider,
    listRef,
    viewabilityConfig,
    onViewableItemsChanged: handleViewableItemsChanged,
    handleProviderChange
  }
}
