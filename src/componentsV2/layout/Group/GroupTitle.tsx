import Text from '@/componentsV2/base/Text'
import React from 'react'
import { TextProps } from 'react-native'

export interface GroupTitleProps extends TextProps {
  className?: string
}

const GroupTitle: React.FC<GroupTitleProps> = ({ className, ...props }) => {
  return <Text className={`pl-3 font-bold opacity-70 ${className || ''}`} {...props} />
}

export default GroupTitle
