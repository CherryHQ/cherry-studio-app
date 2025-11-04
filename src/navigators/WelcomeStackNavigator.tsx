import { createStackNavigator, TransitionPresets } from '@react-navigation/stack'
import React from 'react'

import LandropSettingsScreen from '@/screens/settings/data/Landrop/LandropSettingsScreen'
import WelcomeScreen from '@/screens/welcome/WelcomeScreen'

export type WelcomeStackParamList = {
  WelcomeScreen: undefined
  LandropSettingsScreen: { redirectToHome?: boolean } | undefined
}

const Stack = createStackNavigator<WelcomeStackParamList>()

export default function WelcomeStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureResponseDistance: 9999,
        ...TransitionPresets.SlideFromRightIOS
      }}>
      <Stack.Screen name="WelcomeScreen" component={WelcomeScreen} />
      <Stack.Screen name="LandropSettingsScreen" component={LandropSettingsScreen} />
    </Stack.Navigator>
  )
}
