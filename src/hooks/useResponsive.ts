import { useEffect } from 'react'
import type { ScaledSize } from 'react-native'
import { Dimensions, useWindowDimensions } from 'react-native'

export type DeviceType = 'phone' | 'tablet'
export type Orientation = 'portrait' | 'landscape'

interface ResponsiveInfo {
  deviceType: DeviceType
  orientation: Orientation
  isTablet: boolean
  isPhone: boolean
  isPortrait: boolean
  isLandscape: boolean
  width: number
  height: number
}

/**
 * 判断是否为平板设备
 * iPad Mini: 768x1024
 * iPad Pro 11": 834x1194
 * iPad Pro 12.9": 1024x1366
 * 一般认为短边 >= 600 即为平板
 */
const getDeviceType = (width: number, height: number): DeviceType => {
  const minDimension = Math.min(width, height)
  return minDimension >= 600 ? 'tablet' : 'phone'
}

const getOrientation = (width: number, height: number): Orientation => {
  return width > height ? 'landscape' : 'portrait'
}

/**
 * 响应式布局 Hook
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isTablet, isLandscape, width } = useResponsive()
 *
 *   return (
 *     <View style={{
 *       flexDirection: isTablet && isLandscape ? 'row' : 'column'
 *     }}>
 *       <Sidebar />
 *       <Content />
 *     </View>
 *   )
 * }
 * ```
 */
export function useResponsive(): ResponsiveInfo {
  const { width, height } = useWindowDimensions()
  const deviceType = getDeviceType(width, height)
  const orientation = getOrientation(width, height)

  return {
    deviceType,
    orientation,
    isTablet: deviceType === 'tablet',
    isPhone: deviceType === 'phone',
    isPortrait: orientation === 'portrait',
    isLandscape: orientation === 'landscape',
    width,
    height
  }
}

/**
 * 监听屏幕尺寸变化
 *
 * @example
 * ```tsx
 * useDimensionsChange(({ window }) => {
 *   console.log('Screen size changed:', window)
 * })
 * ```
 */
export function useDimensionsChange(callback: (dimensions: { window: ScaledSize; screen: ScaledSize }) => void) {
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', callback)
    return () => subscription.remove()
  }, [callback])
}
