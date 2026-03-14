import { createNativeStackNavigator } from '@react-navigation/native-stack'
import React from 'react'

import AssistantDetailScreen from '@/screens/assistant/AssistantDetailScreen'
import AssistantScreen from '@/screens/assistant/AssistantScreen'
import type { AssistantDetailScreenParams } from '@/types/naviagate'

export type AssistantStackParamList = {
  AssistantScreen: undefined
  AssistantDetailScreen: AssistantDetailScreenParams
}

const Stack = createNativeStackNavigator<AssistantStackParamList>()

export default function AssistantStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'ios_from_right',
        gestureEnabled: true,
        fullScreenGestureEnabled: true
      }}>
      <Stack.Screen name="AssistantScreen" component={AssistantScreen} />
      <Stack.Screen
        name="AssistantDetailScreen"
        component={AssistantDetailScreen}
        options={{ gestureEnabled: false, fullScreenGestureEnabled: false }}
      />
    </Stack.Navigator>
  )
}
