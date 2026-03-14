import { createNativeStackNavigator } from '@react-navigation/native-stack'
import React from 'react'

import AssistantMarketScreen from '@/screens/assistant/AssistantMarketScreen'

export type AssistantMarketStackParamList = {
  AssistantMarketScreen: undefined
}

const Stack = createNativeStackNavigator<AssistantMarketStackParamList>()

export default function AssistantMarketStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'ios_from_right',
        gestureEnabled: true,
        fullScreenGestureEnabled: true
      }}>
      <Stack.Screen name="AssistantMarketScreen" component={AssistantMarketScreen} />
    </Stack.Navigator>
  )
}
