import { DrawerActions, useNavigation } from '@react-navigation/native'
import { useCallback } from 'react'

import { useResponsive } from './useResponsive'

/**
 * Hook for safely handling drawer operations
 * In tablet landscape mode, the drawer is always visible and doesn't need open/close actions
 */
export function useDrawer() {
  const navigation = useNavigation()
  const { isTablet, isLandscape } = useResponsive()
  const isTabletLandscape = isTablet && isLandscape

  const openDrawer = useCallback(() => {
    // In tablet landscape mode, drawer is always visible, no need to open
    if (isTabletLandscape) {
      return
    }
    navigation.dispatch(DrawerActions.openDrawer())
  }, [navigation, isTabletLandscape])

  const closeDrawer = useCallback(() => {
    // In tablet landscape mode, drawer is always visible, no need to close
    if (isTabletLandscape) {
      return
    }
    navigation.dispatch(DrawerActions.closeDrawer())
  }, [navigation, isTabletLandscape])

  const toggleDrawer = useCallback(() => {
    // In tablet landscape mode, drawer is always visible, no need to toggle
    if (isTabletLandscape) {
      return
    }
    navigation.dispatch(DrawerActions.toggleDrawer())
  }, [navigation, isTabletLandscape])

  return {
    openDrawer,
    closeDrawer,
    toggleDrawer,
    // Indicates if currently in tablet landscape mode (drawer is always visible in this mode)
    isDrawerAlwaysVisible: isTabletLandscape
  }
}
