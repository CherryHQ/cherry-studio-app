import React from 'react'
import type { ViewProps } from 'react-native'

import YStack from '../YStack'

export interface GroupProps extends ViewProps {
  className?: string
}

const Group: React.FC<GroupProps> = ({ className, children, ...props }) => {
  return (
    <YStack
      className={`overflow-hidden rounded-xl bg-ui-card-background ${className || ''}`}
      {...props}>
      {children}
    </YStack>
  )
}

export default Group
