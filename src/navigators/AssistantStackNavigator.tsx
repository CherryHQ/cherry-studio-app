import { createNativeStackNavigator } from '@react-navigation/native-stack'
import React from 'react'

import AssistantDetailScreen from '@/screens/assistant/AssistantDetailScreen'
import AssistantMarketScreen from '@/screens/assistant/AssistantMarketScreen'
import AssistantScreen from '@/screens/assistant/AssistantScreen'

export type AssistantStackParamList = {
  AssistantScreen: undefined
  AssistantMarketScreen: undefined
  AssistantDetailScreen: { assistantId: string; tab?: string }
}

const Stack = createNativeStackNavigator<AssistantStackParamList>()

export default function AssistantStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureResponseDistance: { start: 9999 },
        animation: 'slide_from_right'
      }}>
      <Stack.Screen name="AssistantScreen" component={AssistantScreen} />
      <Stack.Screen name="AssistantMarketScreen" component={AssistantMarketScreen} />
      <Stack.Screen name="AssistantDetailScreen" component={AssistantDetailScreen} />
    </Stack.Navigator>
  )
}
