import MaskedView from '@react-native-masked-view/masked-view'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import React, { type FC } from 'react'
import { Platform, StyleSheet, View } from 'react-native'

import { useTheme } from '@/hooks/useTheme'

const GRADIENT_HEIGHT = 20

interface GradientBlurEdgeProps {
  visible: boolean
  height?: number
}

export const GradientBlurEdge: FC<GradientBlurEdgeProps> = ({ visible, height = GRADIENT_HEIGHT }) => {
  const { isDark } = useTheme()

  if (!visible) return null

  return (
    <View style={[styles.container, { height }]} pointerEvents="none">
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={
          <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,1)']} style={StyleSheet.absoluteFill} />
        }>
        <BlurView
          intensity={10}
          tint={isDark ? 'dark' : 'light'}
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : 'none'}
          style={StyleSheet.absoluteFill}
        />
      </MaskedView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10
  }
})
