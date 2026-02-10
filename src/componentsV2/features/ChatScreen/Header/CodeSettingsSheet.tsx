import { Switch } from 'heroui-native'
import React, { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'

import { Group, GroupTitle } from '@/componentsV2'
import Text from '@/componentsV2/base/Text'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { usePreference } from '@/hooks/usePreference'
import { useTheme } from '@/hooks/useTheme'
import { Width } from '@/utils/device'

const DRAWER_WIDTH = Width * 0.75

let setIsVisibleCallback: ((isVisible: boolean) => void) | null = null

export const presentCodeSettingsSheet = () => {
  setIsVisibleCallback?.(true)
}

export const dismissCodeSettingsSheet = () => {
  setIsVisibleCallback?.(false)
}

const CodeSettingsSheet: React.FC = () => {
  const { isDark } = useTheme()
  const [isVisible, setIsVisible] = useState(false)
  const [showLineNumbers, setShowLineNumbers] = usePreference('code.show_line_numbers')
  const translateX = useSharedValue(DRAWER_WIDTH)

  useEffect(() => {
    setIsVisibleCallback = setIsVisible
    return () => {
      setIsVisibleCallback = null
    }
  }, [])

  useEffect(() => {
    translateX.value = withTiming(isVisible ? 0 : DRAWER_WIDTH, {
      duration: 250,
      easing: Easing.bezier(0.4, 0, 0.2, 1)
    })
  }, [isVisible, translateX])

  const rBackdropStyle = useAnimatedStyle(() => {
    'worklet'
    const opacity = interpolate(translateX.value, [0, DRAWER_WIDTH], [0.5, 0], Extrapolation.CLAMP)
    return {
      opacity,
      pointerEvents: opacity < 0.01 ? 'none' : 'auto'
    }
  })

  const handleClose = () => {
    setIsVisible(false)
  }

  const rContentStyle = useAnimatedStyle(() => {
    'worklet'
    return {
      transform: [{ translateX: translateX.value }]
    }
  })

  const dynamicDrawerStyle = {
    backgroundColor: isDark ? '#000000' : '#f8f8f8'
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, rBackdropStyle, { backgroundColor: 'black' }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>
      <Animated.View style={[rContentStyle, styles.drawer, dynamicDrawerStyle]}>
        <YStack className="gap-4 p-4">
          <GroupTitle>Code Settings</GroupTitle>
          <Group>
            <XStack className="items-center justify-between p-4">
              <Text className="text-lg">Show Line Number</Text>
              <Switch isSelected={showLineNumbers} onSelectedChange={setShowLineNumbers} />
            </XStack>
          </Group>
        </YStack>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: DRAWER_WIDTH,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5
  }
})

CodeSettingsSheet.displayName = 'CodeSettingsSheet'

export default CodeSettingsSheet
