import React from 'react'
import Svg, { Path } from 'react-native-svg'

import { useTheme } from '@/hooks/useTheme'

import type { IconProps } from '../types'

export function TranslationIcon(props: IconProps) {
  const { isDark } = useTheme()
  const fillColor = isDark ? 'white' : 'black'
  return (
    <Svg width={props.size} height={props.size} viewBox="0 0 20 20" fill="none" {...props}>
      <Path
        d="M1.52979 3.11792H8.94155"
        stroke={fillColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6.8239 1.00024V3.11789C6.8239 7.79577 4.4532 11.5885 1.52979 11.5885"
        stroke={fillColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M2.58838 7.35303C2.5852 9.62315 5.71403 11.4909 9.6825 11.5883"
        stroke={fillColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M10 18.9999L14.2353 9.47046L18.4706 18.9999"
        stroke={fillColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M17.5183 16.8826H10.9536"
        stroke={fillColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function TranslatedIcon(props: IconProps) {
  const { isDark } = useTheme()
  const fillColor = props.color || (isDark ? 'white' : 'black')
  return (
    <Svg width={props.size} height={props.size} viewBox="0 0 20 20" fill="none" {...props}>
      <Path
        d="M7 3.00024H9M2 3.00024H3H2Z"
        stroke={fillColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6.492 6.517C5.678 9.172 3.972 11 2 11M7 1V3V1Z"
        stroke={fillColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M3 7.00049C2.997 9.14449 5.952 10.9085 9.7 11.0005"
        stroke={fillColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M13.691 9.69427L14 8.99927L14.8 10.7993M10 17.9993L12.463 12.4583L10 17.9993Z"
        stroke={fillColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M16.0004 16.0005H10.9004"
        stroke={fillColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M1 1L19 19" stroke={fillColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}
