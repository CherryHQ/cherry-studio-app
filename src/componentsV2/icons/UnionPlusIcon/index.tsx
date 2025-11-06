import React from 'react'
import Svg, { Path } from 'react-native-svg'

import { useTheme } from '@/hooks/useTheme'

import type { IconProps } from '../types'

export function UnionPlusIcon(props: IconProps) {
  const { isDark } = useTheme()

  const strokeColor = isDark ? '#f9f9f9ff' : '#202020ff'

  return (
    <Svg width={props.size} height={props.size} viewBox="0 0 26 26" fill="none" {...props}>
      <Path
        d="M1.00049 6.36092C1.00049 3.72054 3.25936 1.58008 6.04581 1.58008C8.83226 1.58008 11.0911 3.72054 11.0911 6.36092V9.54815C11.0911 9.91866 11.0911 10.1039 11.0482 10.2559C10.9315 10.6684 10.5915 10.9905 10.1563 11.101C9.99586 11.1418 9.80036 11.1418 9.40936 11.1418H6.04581C3.25936 11.1418 1.00049 9.00131 1.00049 6.36092Z"
        stroke={strokeColor}
        strokeWidth="1.5"
      />
      <Path
        d="M14.9092 16.451C14.9092 16.0805 14.9092 15.8953 14.9522 15.7433C15.0688 15.3308 15.4088 15.0087 15.8441 14.8981C16.0045 14.8574 16.2 14.8574 16.591 14.8574H19.9545C22.741 14.8574 24.9998 16.9979 24.9998 19.6383C24.9998 22.2787 22.741 24.4191 19.9545 24.4191C17.168 24.4191 14.9092 22.2787 14.9092 19.6383V16.451Z"
        stroke={strokeColor}
        strokeWidth="1.5"
      />
      <Path
        d="M1 19.6383C1 16.9979 3.25887 14.8574 6.04532 14.8574H9.07252C9.77893 14.8574 10.1321 14.8574 10.4019 14.9877C10.6393 15.1023 10.8322 15.2851 10.9532 15.51C11.0906 15.7657 11.0906 16.1004 11.0906 16.7698V19.6383C11.0906 22.2787 8.83178 24.4191 6.04532 24.4191C3.25887 24.4191 1 22.2787 1 19.6383Z"
        stroke={strokeColor}
        strokeWidth="1.5"
      />
      <Path
        d="M15.9092 6.64545H19.3758M19.3758 6.64545H22.8424M19.3758 6.64545V10.1122M19.3758 6.64545V3.17871"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Svg>
  )
}
