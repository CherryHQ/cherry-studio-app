import React from 'react'
import Svg, {
  ClipPath,
  Defs,
  FeBlend,
  FeColorMatrix,
  FeComposite,
  FeFlood,
  FeGaussianBlur,
  FeOffset,
  Filter,
  G,
  Path,
  Rect
} from 'react-native-svg'

import type { IconProps } from '../types'

export function DefaultProviderIcon(props: IconProps) {
  return (
    <Svg width={props.size} height={props.size} viewBox="0 0 102 109" fill="none" rotation={-10} {...props}>
      <G clipPath="url(#clip0_4303_2223)" filter="url(#filter0_i_4303_2223)">
        <Path
          d="M30.1107 129.373C40.8358 135.589 54.4507 131.924 81.6871 124.6C108.923 117.284 122.538 113.619 128.732 102.848C134.925 92.0836 131.274 78.4191 123.977 51.0835C116.687 23.7478 113.035 10.0833 102.303 3.86739C91.5781 -2.34855 77.9632 1.30983 50.7268 8.63976C23.4904 15.9565 9.87545 19.6215 3.68208 30.3922C-2.5113 41.1564 1.1338 54.821 8.43712 82.1566C15.7273 109.492 19.379 123.157 30.1107 129.373Z"
          fill="#ACF3A633"
        />
        <G filter="url(#filter1_i_4303_2223)">
          <Path
            d="M64.9714 49.4297C67.2769 48.8089 68.3972 45.4878 67.4716 42.0148C66.5416 38.5418 63.9203 36.2279 61.6105 36.8487C59.305 37.4695 58.1847 40.7863 59.1147 44.2636C60.0404 47.7366 62.6616 50.0505 64.9714 49.4297ZM39.9009 56.1716C42.2107 55.5509 43.3267 52.2298 42.401 48.7568C41.4754 45.2838 38.8541 42.9699 36.5443 43.5907C34.2345 44.2115 33.1185 47.5282 34.0442 51.0056C34.9741 54.4786 37.5911 56.7924 39.9009 56.1716ZM35.9344 69.0825C36.038 68.6678 36.2221 68.2776 36.476 67.9342C36.7299 67.5908 37.0487 67.301 37.4142 67.0813C37.7797 66.8616 38.1848 66.7163 38.6063 66.6537C39.0277 66.5911 39.4574 66.6125 39.8706 66.7165C44.7584 67.9451 50.3729 67.9625 56.0739 66.43C61.7749 64.8932 66.6281 62.0627 70.2528 58.5463C70.5585 58.2463 70.9202 58.0098 71.3171 57.8506C71.7141 57.6913 72.1385 57.6124 72.566 57.6183C72.9935 57.6242 73.4156 57.7148 73.808 57.885C74.2005 58.0552 74.5555 58.3015 74.8528 58.6099C75.1501 58.9183 75.3837 59.2826 75.5402 59.6818C75.6967 60.0811 75.7731 60.5075 75.7648 60.9365C75.7566 61.3655 75.664 61.7886 75.4923 62.1816C75.3206 62.5745 75.0732 62.9295 74.7643 63.2262C73.2274 64.7132 71.5628 66.0613 69.79 67.2549L70.4778 68.6527C70.856 69.4207 71.0795 70.256 71.1355 71.1108C71.1916 71.9656 71.079 72.8231 70.8043 73.6341C70.5296 74.4452 70.0981 75.1939 69.5346 75.8373C68.9711 76.4808 68.2867 77.0063 67.5205 77.3838C66.7543 77.7613 65.9214 77.9833 65.0695 78.0372C64.2177 78.0911 63.3636 77.9758 62.5563 77.6979C61.7489 77.4199 61.0041 76.9849 60.3645 76.4176C59.725 75.8503 59.2033 75.1619 58.8292 74.3919L57.9814 72.6554L57.7522 72.7161C51.026 74.5264 44.2912 74.5395 38.2918 73.0331C37.8785 72.929 37.4897 72.7443 37.1476 72.4895C36.8055 72.2347 36.5167 71.9147 36.2978 71.5478C36.0789 71.181 35.9341 70.7745 35.8718 70.3515C35.8094 69.9285 35.8307 69.4973 35.9344 69.0825Z"
            fill="#ACF3A6"
          />
        </G>
      </G>
      <Defs>
        <Filter
          id="filter0_i_4303_2223"
          x="-199.471"
          y="-199.297"
          width="522.879"
          height="529.706"
          filterUnits="userSpaceOnUse">
          <FeFlood floodOpacity="0" result="BackgroundImageFix" />
          <FeBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <FeColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <FeOffset />
          <FeGaussianBlur stdDeviation="2" />
          <FeComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <FeColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.25 0" />
          <FeBlend mode="normal" in2="shape" result="effect1_innerShadow_4303_2223" />
        </Filter>
        <Filter
          id="filter1_i_4303_2223"
          x="-166.281"
          y="-163.252"
          width="442.047"
          height="441.302"
          filterUnits="userSpaceOnUse">
          <FeFlood floodOpacity="0" result="BackgroundImageFix" />
          <FeBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <FeColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <FeOffset />
          <FeGaussianBlur stdDeviation="2" />
          <FeComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <FeColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.25 0" />
          <FeBlend mode="normal" in2="shape" result="effect1_innerShadow_4303_2223" />
        </Filter>
        <ClipPath id="clip0_4303_2223">
          <Rect width="122.879" height="129.706" fill="white" transform="translate(0.529297 0.703125)" />
        </ClipPath>
      </Defs>
    </Svg>
  )
}
