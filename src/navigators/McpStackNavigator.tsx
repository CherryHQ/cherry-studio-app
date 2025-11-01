import { createNativeStackNavigator } from '@react-navigation/native-stack'
import React from 'react'

import { McpMarketScreen } from '@/screens/mcp/McpMarketScreen'

export type McpStackParamList = {
  McpMarketScreen: undefined
}

const Stack = createNativeStackNavigator<McpStackParamList>()

export default function McpStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureResponseDistance: { start: 9999 }, 
        animation: 'slide_from_right'
      }}>
      <Stack.Screen name="McpMarketScreen" component={McpMarketScreen} />
    </Stack.Navigator>
  )
}
