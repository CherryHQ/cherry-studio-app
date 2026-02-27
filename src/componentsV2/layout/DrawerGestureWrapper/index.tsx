import type { PropsWithChildren } from 'react'
import React from 'react'
import { PanGestureHandler, State } from 'react-native-gesture-handler'

import { useDrawer } from '@/hooks/useDrawer'

interface DrawerGestureWrapperProps extends PropsWithChildren {
  enabled?: boolean
}

/**
 * Common wrapper component for handling drawer opening gesture
 * Swipe right from anywhere on the screen to open the drawer
 * In tablet landscape mode, the drawer is always visible so gestures are ignored
 */
export const DrawerGestureWrapper = ({ children, enabled = true }: DrawerGestureWrapperProps) => {
  const { openDrawer, isDrawerAlwaysVisible } = useDrawer()

  const handleSwipeGesture = (event: any) => {
    if (!enabled || isDrawerAlwaysVisible) return

    const { translationX, velocityX, state } = event.nativeEvent

    // Detect right swipe gesture
    if (state === State.END) {
      // Full screen swipe trigger: distance > 20 and velocity > 100, or distance > 80
      const hasGoodDistance = translationX > 20
      const hasGoodVelocity = velocityX > 100
      const hasExcellentDistance = translationX > 80

      if ((hasGoodDistance && hasGoodVelocity) || hasExcellentDistance) {
        openDrawer()
      }
    }
  }

  if (!enabled || isDrawerAlwaysVisible) {
    return <>{children}</>
  }

  return (
    <PanGestureHandler
      onGestureEvent={handleSwipeGesture}
      onHandlerStateChange={handleSwipeGesture}
      activeOffsetX={[-10, 10]}
      failOffsetY={[-20, 20]}>
      {children}
    </PanGestureHandler>
  )
}
