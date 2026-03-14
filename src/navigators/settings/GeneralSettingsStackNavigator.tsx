import { createNativeStackNavigator } from '@react-navigation/native-stack'
import React from 'react'

import GeneralSettingsScreen from '@/screens/settings/general/GeneralSettingsScreen'

export type GeneralSettingsStackParamList = {
  GeneralSettingsScreen: undefined
}

const Stack = createNativeStackNavigator<GeneralSettingsStackParamList>()

export default function GeneralSettingsStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'ios_from_right',
        gestureEnabled: true,
        fullScreenGestureEnabled: true
      }}>
      <Stack.Screen name="GeneralSettingsScreen" component={GeneralSettingsScreen} />
    </Stack.Navigator>
  )
}
