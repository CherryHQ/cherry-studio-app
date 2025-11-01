import React from 'react'
import { ViewProps } from 'react-native'
import YStack from '../YStack'

export interface GroupProps extends ViewProps {
  className?: string
}

const Group: React.FC<GroupProps> = ({ className, children, ...props }) => {
  return (
    <YStack
      className={`overflow-hidden rounded-xl bg-ui-card-background dark:bg-ui-card-background-dark ${className || ''}`}
      {...props}>
      {children}
    </YStack>
  )
}

export default Group
