import { createNativeStackNavigator } from '@react-navigation/native-stack'
import React from 'react'

import McpDetailScreen from '@/screens/mcp/McpDetailScreen'
import { McpMarketScreen } from '@/screens/mcp/McpMarketScreen'
import McpScreen from '@/screens/mcp/McpScreen'

export type McpStackParamList = {
  McpScreen: undefined
  McpMarketScreen: undefined
  McpDetailScreen: { mcpId?: string }
}

const Stack = createNativeStackNavigator<McpStackParamList>()

export default function McpStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'ios_from_right',
        gestureEnabled: true,
        fullScreenGestureEnabled: true
      }}>
      <Stack.Screen name="McpScreen" component={McpScreen} />
      <Stack.Screen name="McpMarketScreen" component={McpMarketScreen} />
      <Stack.Screen name="McpDetailScreen" component={McpDetailScreen} />
    </Stack.Navigator>
  )
}
