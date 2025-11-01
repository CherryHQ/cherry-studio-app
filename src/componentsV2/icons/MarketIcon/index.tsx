import { useTheme } from 'heroui-native'
import React from 'react'
import Svg, { Path } from 'react-native-svg'

import type { IconProps } from '../types'

export function MarketIcon(props: IconProps) {
  const { isDark } = useTheme()

  const strokeColor = isDark ? '#f9f9f9ff' : '#202020ff'
  return (
    <Svg width={props.size} height={props.size} viewBox="0 0 24 24" fill="none" {...props}>
      <Path
        d="M3.00977 11.2202V15.7102C3.00977 20.2002 4.80977 22.0002 9.29977 22.0002H14.6898C19.1798 22.0002 20.9798 20.2002 20.9798 15.7102V11.2202"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12.0005 12C13.8305 12 15.1805 10.51 15.0005 8.68L14.3405 2H9.67048L9.00048 8.68C8.82048 10.51 10.1705 12 12.0005 12Z"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M18.3098 12C20.3298 12 21.8098 10.36 21.6098 8.35L21.3298 5.6C20.9698 3 19.9698 2 17.3498 2H14.2998L14.9998 9.01C15.1698 10.66 16.6598 12 18.3098 12Z"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5.64037 12C7.29037 12 8.78037 10.66 8.94037 9.01L9.16037 6.8L9.64037 2H6.59037C3.97037 2 2.97037 3 2.61037 5.6L2.34037 8.35C2.14037 10.36 3.62037 12 5.64037 12Z"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 17C10.33 17 9.5 17.83 9.5 19.5V22H14.5V19.5C14.5 17.83 13.67 17 12 17Z"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
