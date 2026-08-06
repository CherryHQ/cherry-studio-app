import { createNativeStackNavigator } from '@react-navigation/native-stack'
import React from 'react'

import AgentScreen from '@/screens/agent/AgentScreen'

export type AgentStackParamList = {
  AgentScreen: undefined
}

const Stack = createNativeStackNavigator<AgentStackParamList>()

export default function AgentStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'ios_from_right', gestureEnabled: true }}>
      <Stack.Screen name="AgentScreen" component={AgentScreen} />
    </Stack.Navigator>
  )
}
