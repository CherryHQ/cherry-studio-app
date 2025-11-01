import { useTheme } from 'heroui-native'
import React from 'react'
import Svg, { Path } from 'react-native-svg'

import type { IconProps } from '../types'

export function UserChangeIcon(props: IconProps) {
  const { isDark } = useTheme()
  const strokeColor = props.color || (isDark ? '#acf3a6ff' : '#81df94ff')

  return (
    <Svg width={props.size || 13} height={props.size || 13} viewBox="0 0 13 15" fill="none" {...props}>
      <Path
        d="M6.50033 6.99967C7.9961 6.99967 9.20866 5.78711 9.20866 4.29134C9.20866 2.79557 7.9961 1.58301 6.50033 1.58301C5.00455 1.58301 3.79199 2.79557 3.79199 4.29134C3.79199 5.78711 5.00455 6.99967 6.50033 6.99967Z"
        stroke={strokeColor}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M1.84766 12.4167C1.84766 10.3204 3.93309 8.625 6.50059 8.625C7.06392 8.625 7.60557 8.70625 8.10932 8.85791"
        stroke={strokeColor}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M11.8691 10.6328H9.10274C8.77118 10.6328 8.50181 10.9022 8.50181 11.2337V11.8969"
        stroke={strokeColor}
        strokeWidth="0.7"
        strokeMiterlimit="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M11.2371 10L11.8691 10.632L11.2371 11.264"
        stroke={strokeColor}
        strokeWidth="0.7"
        strokeMiterlimit="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M8.50181 13.3676H11.2682C11.5998 13.3676 11.8691 13.0982 11.8691 12.7666V12.1035"
        stroke={strokeColor}
        strokeWidth="0.7"
        strokeMiterlimit="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9.13281 14.0004L8.50081 13.3684L9.13281 12.7363"
        stroke={strokeColor}
        strokeWidth="0.7"
        strokeMiterlimit="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
