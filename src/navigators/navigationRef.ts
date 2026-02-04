import type { NavigationContainerRef, ParamListBase } from '@react-navigation/native'
import { createRef } from 'react'


export const navigationRef = createRef<NavigationContainerRef<ParamListBase>>()

export function isNavigationReady(): boolean {
  return navigationRef.current !== null && navigationRef.current !== undefined
}


export function safeNavigate(name: string, params?: object): void {
  if (isNavigationReady()) {
    navigationRef.current?.navigate(name, params)
  }
}
