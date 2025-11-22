import { createStackNavigator, TransitionPresets } from '@react-navigation/stack'
import React from 'react'

import GeneralSettingsScreen from '@/screens/settings/general/GeneralSettingsScreen'

export type GeneralSettingsStackParamList = {
  GeneralSettingsScreen: undefined
}

const Stack = createStackNavigator<GeneralSettingsStackParamList>()

export default function GeneralSettingsStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureResponseDistance: 9999,
        ...TransitionPresets.SlideFromRightIOS
      }}>
      <Stack.Screen name="GeneralSettingsScreen" component={GeneralSettingsScreen} />
    </Stack.Navigator>
  )
}
