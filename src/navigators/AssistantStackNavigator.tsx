import { createStackNavigator, TransitionPresets } from '@react-navigation/stack'
import React from 'react'

import AssistantDetailScreen from '@/screens/assistant/AssistantDetailScreen'
import AssistantScreen from '@/screens/assistant/AssistantScreen'
import type { AssistantDetailScreenParams } from '@/types/naviagate'

export type AssistantStackParamList = {
  AssistantScreen: undefined
  AssistantDetailScreen: AssistantDetailScreenParams
}

const Stack = createStackNavigator<AssistantStackParamList>()

export default function AssistantStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureResponseDistance: 9999,
        ...TransitionPresets.SlideFromRightIOS
      }}>
      <Stack.Screen name="AssistantScreen" component={AssistantScreen} />
      <Stack.Screen name="AssistantDetailScreen" component={AssistantDetailScreen} />
    </Stack.Navigator>
  )
}
