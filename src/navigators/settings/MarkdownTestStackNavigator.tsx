import { createStackNavigator, TransitionPresets } from '@react-navigation/stack'
import React from 'react'

import MarkdownTestScreen from '@/screens/settings/markdown-test/MarkdownTestScreen'

export type MarkdownTestStackParamList = {
  MarkdownTestScreen: undefined
}

const Stack = createStackNavigator<MarkdownTestStackParamList>()

export default function MarkdownTestStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureResponseDistance: 9999,
        ...TransitionPresets.SlideFromRightIOS
      }}>
      <Stack.Screen name="MarkdownTestScreen" component={MarkdownTestScreen} />
    </Stack.Navigator>
  )
}
