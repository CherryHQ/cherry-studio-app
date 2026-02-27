import { useNavigation, useNavigationState } from '@react-navigation/native'
import React from 'react'
import { Pressable } from 'react-native'

import Text from '@/componentsV2/base/Text'
import XStack from '@/componentsV2/layout/XStack'
import { useResponsive } from '@/hooks/useResponsive'

import { ArrowLeft } from '../../icons/LucideIcon'

// 这几个界面不显示返回按钮
const SETTINGS_MAIN_SCREENS = new Set([
  'ProviderListScreen',
  'AssistantSettingsScreen',
  'WebSearchSettingsScreen',
  'GeneralSettingsScreen',
  'DataSettingsScreen',
  'AboutScreen'
])

function getCurrentRouteName(state: any): string | undefined {
  let route = state.routes[state.index] as any
  while (route.state?.routes) {
    route = route.state.routes[route.state.index ?? 0] as any
  }
  return route?.name as string | undefined
}

export interface HeaderBarButton {
  icon: React.ReactNode
  onPress: () => void
}

export interface HeaderBarProps {
  title?: string
  onBackPress?: () => void
  leftButton?: HeaderBarButton
  rightButton?: HeaderBarButton
  rightButtons?: HeaderBarButton[]
  showBackButton?: boolean
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  title = '',
  onBackPress,
  leftButton,
  rightButton,
  rightButtons,
  showBackButton = true
}) => {
  const buttonsToRender = rightButtons || (rightButton ? [rightButton] : [])
  const navigation = useNavigation<any>()
  const { isTablet, isLandscape } = useResponsive()
  const currentRoute = useNavigationState(getCurrentRouteName)

  const isSettingsMainScreen = SETTINGS_MAIN_SCREENS.has(currentRoute ?? '')
  const shouldShowBackButton = showBackButton && !(isTablet && isLandscape && isSettingsMainScreen)

  const handleBack = () => {
    if (onBackPress) return onBackPress()
    navigation?.goBack?.()
  }

  return (
    <XStack className="relative h-11 items-center justify-between px-4">
      {/* Left area */}
      <XStack className="min-w-[40px] items-center">
        {leftButton ? (
          <Pressable
            hitSlop={10}
            onPress={leftButton.onPress}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            {leftButton.icon}
          </Pressable>
        ) : shouldShowBackButton ? (
          <Pressable hitSlop={10} onPress={handleBack} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <ArrowLeft size={24} />
          </Pressable>
        ) : (
          <XStack className="w-[40px]" />
        )}
      </XStack>

      {/* Right area */}
      <XStack className="min-w-[40px] items-center justify-end">
        {buttonsToRender.length > 0 ? (
          <XStack className="gap-3">
            {buttonsToRender.map((button, index) => (
              <Pressable
                key={index}
                hitSlop={10}
                onPress={button.onPress}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                {button.icon}
              </Pressable>
            ))}
          </XStack>
        ) : (
          <XStack className="w-[40px]" />
        )}
      </XStack>

      {/* Title - centered absolutely */}
      <XStack className="absolute inset-y-0 left-4 right-4 items-center justify-center" pointerEvents="none">
        <Text className="text-center text-[18px] font-bold">{title}</Text>
      </XStack>
    </XStack>
  )
}

export default HeaderBar
