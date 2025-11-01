import { createNativeStackNavigator } from '@react-navigation/native-stack'
import React from 'react'

import AboutScreen from '@/screens/settings/about/AboutScreen'
import PersonalScreen from '@/screens/settings/personal/PersonalScreen'

export type AboutStackParamList = {
  PersonalScreen: undefined
  AboutScreen: undefined
}

const Stack = createNativeStackNavigator<AboutStackParamList>()

export default function AboutStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureResponseDistance: { start: 9999 }, 
        animation: 'slide_from_right'
      }}>
      <Stack.Screen name="PersonalScreen" component={PersonalScreen} />
      <Stack.Screen name="AboutScreen" component={AboutScreen} />
    </Stack.Navigator>
  )
}
