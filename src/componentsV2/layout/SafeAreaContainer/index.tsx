import { cn } from 'heroui-native'
import React from 'react'
import type { ViewProps } from 'react-native'
import { View } from 'react-native'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'

export interface SafeAreaContainerProps extends ViewProps {
  className?: string
}

const SafeAreaContainer: React.FC<SafeAreaContainerProps> = ({ className = '', children, ...props }) => {
  const insets = useSafeAreaInsets()
  const composed = cn('flex-1 bg-background-primary', className)

  return (
    <SafeAreaProvider>
      <View
        className={composed}
        style={{
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingBottom: insets.bottom
        }}
        {...props}>
        {children}
      </View>
    </SafeAreaProvider>
  )
}

export default SafeAreaContainer
