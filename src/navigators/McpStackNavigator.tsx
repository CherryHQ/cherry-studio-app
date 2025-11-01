import { createStackNavigator, TransitionPresets } from '@react-navigation/stack'
import React from 'react'

import { McpMarketScreen } from '@/screens/mcp/McpMarketScreen'

export type McpStackParamList = {
  McpMarketScreen: undefined
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
      <Stack.Screen name="McpMarketScreen" component={McpMarketScreen} />
    </Stack.Navigator>
  )
}
