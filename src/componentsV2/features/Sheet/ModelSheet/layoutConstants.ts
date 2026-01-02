/**
 * Layout constants for ModelSheet components.
 *
 * WARNING: These constants must stay in sync with the actual component styles.
 * When modifying these values, also update the corresponding component styles:
 * - ModelListHeader.tsx - HEADER_HEIGHT
 * - ModelProviderTabBar.tsx - TAB_BAR_HEIGHT
 * - ModelSectionHeader.tsx - marginTop
 * - ModelListItem.tsx - py-* padding
 * - index.tsx - separator h-* height
 */
export const LAYOUT = {
  // Header configuration (must match ModelListHeader.tsx and ModelProviderTabBar.tsx)
  HEADER_HEIGHT: 60, // ModelListHeader height
  TAB_BAR_HEIGHT: 48, // ModelProviderTabBar height

  // Section header configuration
  SECTION_HEADER: {
    HEIGHT: 44, // py-1 (8px) + icon (24px) + padding
    MARGIN_TOP: 12 // marginTop for non-first sections (ModelSectionHeader)
  },

  // List item configuration
  ITEM: {
    HEIGHT: 48, // py-1 (8px) + icon (24px) + tags + padding
    PADDING_Y: 8, // py-1 = 4 * 2 = 8
    SEPARATOR: 8 // h-2 from ItemSeparatorComponent
  },

  // Section separator height
  SECTION_SEPARATOR: 8 // h-2 from SectionSeparatorComponent
} as const

// Computed constant for total header height
export const TOTAL_HEADER_HEIGHT = LAYOUT.HEADER_HEIGHT + LAYOUT.TAB_BAR_HEIGHT

export type LayoutConfig = typeof LAYOUT
