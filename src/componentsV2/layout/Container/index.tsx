import React from 'react'
import { ViewProps, Keyboard } from 'react-native'
import YStack from '../YStack'

export interface ContainerProps extends ViewProps {
  className?: string
}

const Container: React.FC<ContainerProps> = ({ className, children, ...props }) => {
  return (
    <YStack
      className={`flex-1 gap-5 overflow-hidden bg-transparent p-4 ${className || ''}`}
      onStartShouldSetResponder={() => true}
      onResponderRelease={Keyboard.dismiss}
      {...props}>
      {children}
    </YStack>
  )
}
Container.displayName = 'Container'

export default Container
