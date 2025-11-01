import { createNativeStackNavigator } from '@react-navigation/native-stack'
import React from 'react'

import LandropSettingsScreen from '@/screens/settings/data/Landrop/LandropSettingsScreen'
import WelcomeScreen from '@/screens/welcome/WelcomeScreen'

export type WelcomeStackParamList = {
  WelcomeScreen: undefined
  LandropSettingsScreen: undefined
}

const Stack = createNativeStackNavigator<WelcomeStackParamList>()

export default function WelcomeStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureResponseDistance: { start: 9999 },
        animation: 'slide_from_right'
      }}>
      <Stack.Screen name="WelcomeScreen" component={WelcomeScreen} />
      <Stack.Screen name="LandropSettingsScreen" component={LandropSettingsScreen} />
    </Stack.Navigator>
  )
}
