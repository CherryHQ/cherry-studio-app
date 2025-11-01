import { useTheme } from 'heroui-native'
import React from 'react'
import Svg, { Path } from 'react-native-svg'

import type { IconProps } from '../types'

export function AssetsIcon(props: IconProps) {
  const { isDark } = useTheme()
  const strokeColor = isDark ? '#f9f9f9ff' : '#202020ff'

  return (
    <Svg width={props.size} height={props.size} viewBox="0 0 20 20" fill="none" {...props}>
      <Path
        d="M1 5.0211C1 3.04085 2.69417 1.43555 4.78403 1.43555C6.87389 1.43555 8.56806 3.04085 8.56806 5.0211V7.41147C8.56806 7.68934 8.56806 7.82828 8.53583 7.94227C8.44835 8.25161 8.19336 8.49323 7.8669 8.57611C7.7466 8.60666 7.59997 8.60666 7.30672 8.60666H4.78403C2.69417 8.60666 1 7.00135 1 5.0211Z"
        stroke={strokeColor}
        strokeWidth="1.5"
      />
      <Path
        d="M11.4316 12.5887C11.4316 12.3109 11.4316 12.1719 11.4639 12.0579C11.5513 11.7486 11.8063 11.507 12.1328 11.4241C12.2531 11.3936 12.3997 11.3936 12.693 11.3936H15.2157C17.3055 11.3936 18.9997 12.9989 18.9997 14.9791C18.9997 16.9594 17.3055 18.5647 15.2157 18.5647C13.1258 18.5647 11.4316 16.9594 11.4316 14.9791V12.5887Z"
        stroke={strokeColor}
        strokeWidth="1.5"
      />
      <Path
        d="M1 14.9791C1 12.9989 2.69417 11.3936 4.78403 11.3936H7.05445C7.58426 11.3936 7.84917 11.3936 8.05153 11.4913C8.22954 11.5772 8.37426 11.7143 8.46495 11.883C8.56806 12.0747 8.56806 12.3258 8.56806 12.8278V14.9791C8.56806 16.9594 6.87389 18.5647 4.78403 18.5647C2.69417 18.5647 1 16.9594 1 14.9791Z"
        stroke={strokeColor}
        strokeWidth="1.5"
      />
      <Path
        d="M12.1816 5.23477H14.7816M14.7816 5.23477H17.3816M14.7816 5.23477V7.83477M14.7816 5.23477V2.63477"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Svg>
  )
}
