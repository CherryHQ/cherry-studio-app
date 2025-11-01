import { cn } from 'heroui-native'
import React from 'react'
import type { ViewProps } from 'react-native'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

export interface SafeAreaContainerProps extends ViewProps {
  className?: string
}

const SafeAreaContainer: React.FC<SafeAreaContainerProps> = ({ className = '', children, ...props }) => {
  const composed = cn('flex-1 p-safe bg-background-primary dark:bg-background-primary-dark', className)

  return (
    <SafeAreaProvider>
      <View className={composed} {...props}>
        {children}
      </View>
    </SafeAreaProvider>
  )
}

export default SafeAreaContainer
