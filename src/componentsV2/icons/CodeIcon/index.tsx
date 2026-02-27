import React from 'react'
import Svg, { Path } from 'react-native-svg'

import type { IconProps } from '../types'

export function CodeIcon(props: IconProps) {
  return (
    <Svg width={props.size} height={props.size} viewBox="0 0 24 28" fill="none" {...props}>
      <Path
        d="M16.5 0l7 7v15.6c0 2.25 0 3.375-.573 4.164a3 3 0 0 1-.663.663C21.475 28 20.349 28 18.1 28H5.9c-2.25 0-3.375 0-4.164-.573a3 3 0 0 1-.663-.663C.5 25.975.5 24.849.5 22.6V5.4c0-2.25 0-3.375.573-4.164a3 3 0 0 1 .663-.663C2.525 0 3.651 0 5.9 0h10.6z"
        fill="#FDB81E"
      />
      <Path
        d="M16.5 0l7 7h-3.8c-1.12 0-1.68 0-2.108-.218a2 2 0 0 1-.874-.874C16.5 5.48 16.5 4.92 16.5 3.8V0z"
        fill="#fff"
        fillOpacity="0.55"
      />
      <Path
        d="M8.5 9.5l-3.5 3.5 3.5 3.5M15.5 9.5l3.5 3.5-3.5 3.5M12 7.5l-1.5 13"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
