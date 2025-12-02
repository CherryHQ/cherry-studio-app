import { createStackNavigator, TransitionPresets } from '@react-navigation/stack'
import React from 'react'

import AssistantMarketScreen from '@/screens/assistant/AssistantMarketScreen'

export type AssistantMarketStackParamList = {
  AssistantMarketScreen: undefined
}

const Stack = createStackNavigator<AssistantMarketStackParamList>()

export default function AssistantMarketStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureResponseDistance: 9999,
        ...TransitionPresets.SlideFromRightIOS
      }}>
      <Stack.Screen name="AssistantMarketScreen" component={AssistantMarketScreen} />
    </Stack.Navigator>
  )
}
