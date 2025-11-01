import { createNativeStackNavigator } from '@react-navigation/native-stack'
import React from 'react'

import GeneralSettingsScreen from '@/screens/settings/general/GeneralSettingsScreen'
import LanguageChangeScreen from '@/screens/settings/general/LanguageChangeScreen'
import ThemeSettingsScreen from '@/screens/settings/general/ThemeSettingsScreen'

export type GeneralSettingsStackParamList = {
  GeneralSettingsScreen: undefined
  ThemeSettingsScreen: undefined
  LanguageChangeScreen: undefined
}

const Stack = createNativeStackNavigator<GeneralSettingsStackParamList>()

export default function GeneralSettingsStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureResponseDistance: { start: 9999 },
        animation: 'slide_from_right'
      }}>
      <Stack.Screen name="GeneralSettingsScreen" component={GeneralSettingsScreen} />
      <Stack.Screen name="ThemeSettingsScreen" component={ThemeSettingsScreen} />
      <Stack.Screen name="LanguageChangeScreen" component={LanguageChangeScreen} />
    </Stack.Navigator>
  )
}
