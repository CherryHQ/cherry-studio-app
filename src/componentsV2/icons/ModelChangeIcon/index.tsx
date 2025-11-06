import React from 'react'
import Svg, { Path } from 'react-native-svg'

import { useTheme } from '@/hooks/useTheme'

import type { IconProps } from '../types'

export function ModelChangeIcon(props: IconProps) {
  const { isDark } = useTheme()
  const strokeColor = props.color || (isDark ? '#acf3a6ff' : '#81df94ff')

  return (
    <Svg width={props.size || 13} height={props.size || 13} viewBox="0 0 13 13" fill="none" {...props}>
      <Path
        d="M11.9167 8.62402C11.9167 10.7203 10.2213 12.4157 8.125 12.4157L8.69375 11.4678"
        stroke={strokeColor}
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M1.08398 5.3737C1.08398 3.27745 2.7794 1.58203 4.87565 1.58203L4.3069 2.52995"
        stroke={strokeColor}
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M7.41992 2.90918L9.57575 4.15501L11.7099 2.9146"
        stroke={strokeColor}
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9.57617 6.35845V4.14844"
        stroke={strokeColor}
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9.06672 1.69578L7.76671 2.41617C7.47421 2.57867 7.23047 2.99034 7.23047 3.32617V4.70202C7.23047 5.03786 7.4688 5.44952 7.76671 5.61202L9.06672 6.33245C9.34297 6.48953 9.79797 6.48953 10.0796 6.33245L11.3796 5.61202C11.6721 5.44952 11.9159 5.03786 11.9159 4.70202V3.32617C11.9159 2.99034 11.6775 2.57867 11.3796 2.41617L10.0796 1.69578C9.80338 1.54411 9.34839 1.54411 9.06672 1.69578Z"
        stroke={strokeColor}
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M1.27344 8.86816L3.42385 10.114L5.56344 8.87359"
        stroke={strokeColor}
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M3.42383 12.3184V10.1084"
        stroke={strokeColor}
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M2.92023 7.65672L1.62024 8.37711C1.32774 8.53961 1.08398 8.95127 1.08398 9.28711V10.663C1.08398 10.9988 1.32232 11.4105 1.62024 11.573L2.92023 12.2934C3.19648 12.4505 3.65148 12.4505 3.93315 12.2934L5.23315 11.573C5.52565 11.4105 5.7694 10.9988 5.7694 10.663V9.28711C5.7694 8.95127 5.53107 8.53961 5.23315 8.37711L3.93315 7.65672C3.65148 7.50505 3.19648 7.50505 2.92023 7.65672Z"
        stroke={strokeColor}
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
