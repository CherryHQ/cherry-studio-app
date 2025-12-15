import React from 'react'

import Text, { type TextProps } from '@/componentsV2/base/Text'

interface GroupTagProps extends Omit<TextProps, 'children' | 'group'> {
  group: string
}

const GroupTag: React.FC<GroupTagProps> = ({ group, className, ...textProps }) => {
  return (
    <Text className={`rounded-[20px] px-1 py-0.5 ${className || ''}`} {...textProps}>
      {group.charAt(0).toUpperCase() + group.slice(1)}
    </Text>
  )
}

export default GroupTag
