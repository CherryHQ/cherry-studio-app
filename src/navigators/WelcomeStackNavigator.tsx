import { createStackNavigator, TransitionPresets } from '@react-navigation/stack'
import React from 'react'

import LanTransferScreen from '@/screens/settings/data/LanTransfer/LanTransferScreen'
import WelcomeScreen from '@/screens/welcome/WelcomeScreen'

export type WelcomeStackParamList = {
  WelcomeScreen: undefined
  LanTransferScreen: { redirectToHome?: boolean } | undefined
}

const Stack = createStackNavigator<WelcomeStackParamList>()

export default function WelcomeStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        ...TransitionPresets.SlideFromRightIOS
      }}>
      <Stack.Screen name="WelcomeScreen" component={WelcomeScreen} />
      <Stack.Screen name="LanTransferScreen" component={LanTransferScreen} />
    </Stack.Navigator>
  )
}
