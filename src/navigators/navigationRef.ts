import type { NavigationContainerRef, ParamListBase } from '@react-navigation/native'

// Use a mutable ref object instead of createRef to avoid potential memory leaks
// and allow proper cleanup when NavigationContainer unmounts
export const navigationRef: { current: NavigationContainerRef<ParamListBase> | null } = {
  current: null
}

/**
 * Check if navigation is ready (NavigationContainer is mounted)
 */
export function isNavigationReady(): boolean {
  return navigationRef.current !== null && navigationRef.current !== undefined
}

/**
 * Safely navigate to a screen
 * @param name - Screen name
 * @param params - Navigation params
 */
export function safeNavigate(name: string, params?: object): void {
  if (isNavigationReady()) {
    navigationRef.current?.navigate(name, params)
  }
}

/**
 * Reset the navigation ref (call this when NavigationContainer unmounts)
 * This prevents memory leaks by releasing the reference
 */
export function resetNavigationRef(): void {
  navigationRef.current = null
}
