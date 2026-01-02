import { Platform } from 'react-native'

import { isIOS26 } from '@/utils/device'

/**
 * Layout constants for ModelSheet
 */
export const LAYOUT = {
  SHEET_DETENT: 0.85,
  CORNER_RADIUS: 30,
  HEADER_HEIGHT: 60,
  TAB_BAR_HEIGHT: 48,
  HORIZONTAL_PADDING: 20,
  SECTION_MARGIN_TOP: 12
} as const

/**
 * Animation and timing constants
 */
export const ANIMATION = {
  TAB_SCROLL_TIMEOUT_MS: 500,
  VIEWABILITY_THRESHOLD_PERCENT: 50
} as const

/**
 * Get platform-specific sheet configuration
 */
export function getSheetPlatformConfig(isDark: boolean) {
  return {
    grabber: Platform.OS === 'ios',
    backgroundColor: isIOS26 ? undefined : isDark ? '#19191c' : '#ffffff',
    nestedScrollEnabled: Platform.OS === 'android'
  }
}
