import React from 'react'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'

import type { IconProps } from '../types'

export function ArrowIcon(props: IconProps) {
  return (
    <Svg width={props.size} height={props.size} viewBox="0 0 12 13" fill="none" {...props}>
      <Defs>
        <LinearGradient
          id="paint0_linear_5174_9960"
          x1="5.80317"
          y1="4.6377"
          x2="5.80317"
          y2="12.1394"
          gradientUnits="userSpaceOnUse">
          <Stop stopColor="#C0E58D" />
          <Stop offset="1" stopColor="#3BB554" />
        </LinearGradient>
        <LinearGradient
          id="paint1_linear_5174_9960"
          x1="5.80317"
          y1="4.6377"
          x2="5.80317"
          y2="12.1394"
          gradientUnits="userSpaceOnUse">
          <Stop stopColor="#C0E58D" />
          <Stop offset="1" stopColor="#3BB554" />
        </LinearGradient>
        <LinearGradient
          id="paint2_linear_5174_9960"
          x1="6.47116"
          y1="0.860352"
          x2="6.47116"
          y2="6.21902"
          gradientUnits="userSpaceOnUse">
          <Stop stopColor="#C0E58D" />
          <Stop offset="1" stopColor="#3BB554" />
        </LinearGradient>
        <LinearGradient
          id="paint3_linear_5174_9960"
          x1="6.47116"
          y1="0.860352"
          x2="6.47116"
          y2="6.21902"
          gradientUnits="userSpaceOnUse">
          <Stop stopColor="#C0E58D" />
          <Stop offset="1" stopColor="#3BB554" />
        </LinearGradient>
      </Defs>
      <Path
        d="M11.1465 9.42871C11.8281 10.7177 10.457 12.1252 9.14551 11.4717L7.11426 10.4561C6.40875 10.1071 5.58536 10.107 4.87988 10.4561L4.87793 10.457L2.84863 11.4727C1.54304 12.1255 0.166148 10.7175 0.847656 9.42871L0.848633 9.42773L3.07129 5.20508L3.07227 5.20312L3.10059 5.16797C3.13533 5.13857 3.18754 5.1274 3.2373 5.14941L3.23828 5.14844L10.6055 8.47168C10.6337 8.48452 10.6551 8.50657 10.667 8.5293L10.6689 8.53223L11.1465 9.42871Z"
        fill="url(#paint0_linear_5174_9960)"
        stroke="url(#paint1_linear_5174_9960)"
      />
      <Path
        d="M9.11523 5.60742C9.11179 5.62838 9.1001 5.65338 9.0791 5.67578C9.05811 5.69812 9.03397 5.71183 9.0127 5.7168C8.99496 5.72089 8.97035 5.72174 8.93555 5.70605V5.70508L4.10742 3.53027C4.03403 3.4968 4.01101 3.41979 4.04492 3.35547V3.35449L4.66895 2.16406V2.16504C5.23391 1.09233 6.76576 1.09172 7.33105 2.16406L7.33008 2.16504L9.09766 5.53027L9.09961 5.5332C9.11734 5.56645 9.11802 5.59013 9.11523 5.60742Z"
        fill="url(#paint2_linear_5174_9960)"
        stroke="url(#paint3_linear_5174_9960)"
      />
    </Svg>
  )
}
