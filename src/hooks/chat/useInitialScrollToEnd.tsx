import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import useLatestCallback from 'use-latest-callback'

export function useInitialScrollToEnd(blankSize, scrollToEnd, hasMessages) {
  const hasStartedScrolledToEnd = useSharedValue(false)
  const hasScrolledToEnd = useSharedValue(false)
  const scrollToEndJS = useLatestCallback(() => {
    scrollToEnd({ animated: false })
    // Do another one just in case because the list may not have fully laid out yet
    requestAnimationFrame(() => {
      scrollToEnd({ animated: false })

      // and another one again in case
      setTimeout(() => {
        scrollToEnd({ animated: false })

        // and yet another!
        requestAnimationFrame(() => {
          hasScrolledToEnd.set(true)
        })
      }, 16)
    })
  })

  useAnimatedReaction(
    () => {
      if (hasStartedScrolledToEnd.get() || !hasMessages) {
        return false
      }
      return blankSize.get() > 0
    },
    shouldScroll => {
      if (shouldScroll) {
        hasStartedScrolledToEnd.set(true)
        scheduleOnRN(scrollToEndJS)
      }
    }
  )

  return hasScrolledToEnd
}
