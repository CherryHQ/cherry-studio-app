import React from 'react'

import { Text, TextProps } from '@/componentsV2'

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
