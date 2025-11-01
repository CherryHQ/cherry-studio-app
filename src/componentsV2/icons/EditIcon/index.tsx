import { useTheme } from 'heroui-native'
import React from 'react'
import Svg, { Path } from 'react-native-svg'

import type { IconProps } from '../types'

export function EditIcon(props: IconProps) {
  const { isDark } = useTheme()
  const strokeColor = isDark ? '#f9f9f9ff' : '#202020ff'

  return (
    <Svg width={props.size} height={props.size} viewBox="0 0 26 27" fill="none" {...props}>
      <Path
        d="M13 1.9375C4.32875 1.9375 1.4375 4.82875 1.4375 13.5C1.4375 22.1712 4.32875 25.0625 13 25.0625C21.6712 25.0625 24.5625 22.1712 24.5625 13.5"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M22.41 3.8793V3.8793C21.1688 2.78055 19.2725 2.89555 18.1738 4.1368C18.1738 4.1368 12.7125 10.3056 10.8188 12.4468C8.92255 14.5868 10.3125 17.5431 10.3125 17.5431C10.3125 17.5431 13.4425 18.5343 15.31 16.4243C17.1788 14.3143 22.6675 8.11555 22.6675 8.11555C23.7663 6.8743 23.65 4.97805 22.41 3.8793Z"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <Path
        d="M16.7607 5.75098L21.2545 9.72973"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
