import { createStackNavigator, TransitionPresets } from '@react-navigation/stack'
import React from 'react'

import McpDetailScreen from '@/screens/mcp/McpDetailScreen'
import { McpMarketScreen } from '@/screens/mcp/McpMarketScreen'
import McpScreen from '@/screens/mcp/McpScreen'

export type McpStackParamList = {
  McpScreen: undefined
  McpMarketScreen: undefined
  McpDetailScreen: { mcpId?: string }
}

const Stack = createStackNavigator<McpStackParamList>()

export default function McpStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureResponseDistance: 9999,
        ...TransitionPresets.SlideFromRightIOS
      }}>
      <Stack.Screen name="McpScreen" component={McpScreen} />
      <Stack.Screen name="McpMarketScreen" component={McpMarketScreen} />
      <Stack.Screen name="McpDetailScreen" component={McpDetailScreen} />
    </Stack.Navigator>
  )
}
