import { useNavigation } from '@react-navigation/native'
import { ImpactFeedbackStyle } from 'expo-haptics'
import { Gesture } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'

import type { NavigationProps } from '@/types/naviagate'
import { haptic } from '@/utils/haptic'

export function useSwipeGesture() {
  const navigation = useNavigation<NavigationProps>()

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-20, 20])
    .onEnd(event => {
      const { translationX, velocityX } = event

      // 检测向左滑动
      // 全屏可侧滑触发：滑动距离大于20且速度大于100，或者滑动距离大于80
      const hasGoodDistance = translationX > 20
      const hasGoodVelocity = velocityX > 100
      const hasExcellentDistance = translationX > 80

      if ((hasGoodDistance && hasGoodVelocity) || hasExcellentDistance) {
        runOnJS(haptic)(ImpactFeedbackStyle.Medium)
        runOnJS(navigation.goBack)()
      }
    })

  return panGesture
}
