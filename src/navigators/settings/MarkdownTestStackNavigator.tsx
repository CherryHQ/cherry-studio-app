import { createStackNavigator, TransitionPresets } from '@react-navigation/stack'
import React from 'react'

import MarkdownTestScreen from '@/screens/settings/markdown-test/MarkdownTestScreen'
import UITextViewTestScreen from '@/screens/settings/markdown-test/UITextViewTestScreen'

export type MarkdownTestStackParamList = {
  MarkdownTestScreen: undefined
  UITextViewTestScreen: undefined
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
      <Stack.Screen name="UITextViewTestScreen" component={UITextViewTestScreen} />
    </Stack.Navigator>
  )
}
