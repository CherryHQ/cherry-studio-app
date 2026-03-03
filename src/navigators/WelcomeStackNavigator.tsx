import { createNativeStackNavigator } from '@react-navigation/native-stack'
import React from 'react'

import WelcomeScreen from '@/screens/welcome/WelcomeScreen'

export type WelcomeStackParamList = {
  WelcomeScreen: undefined
}

const Stack = createNativeStackNavigator<WelcomeStackParamList>()

export default function WelcomeStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'ios_from_right'
      }}>
      <Stack.Screen name="WelcomeScreen" component={WelcomeScreen} />
    </Stack.Navigator>
  )
}
