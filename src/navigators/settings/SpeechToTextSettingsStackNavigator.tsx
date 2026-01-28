import { createStackNavigator, TransitionPresets } from '@react-navigation/stack'
import React from 'react'

import SpeechToTextProviderSettingsScreen from '@/screens/settings/speech/SpeechToTextProviderSettingsScreen'
import SpeechToTextSettingScreen from '@/screens/settings/speech/SpeechToTextSettingScreen'

export type SpeechToTextSettingsStackParamList = {
  SpeechToTextSettingScreen: undefined
  SpeechToTextProviderSettingsScreen: { providerId: string }
}

const Stack = createStackNavigator<SpeechToTextSettingsStackParamList>()

export default function SpeechToTextSettingsStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureResponseDistance: 9999,
        ...TransitionPresets.SlideFromRightIOS
      }}>
      <Stack.Screen name="SpeechToTextSettingScreen" component={SpeechToTextSettingScreen} />
      <Stack.Screen name="SpeechToTextProviderSettingsScreen" component={SpeechToTextProviderSettingsScreen} />
    </Stack.Navigator>
  )
}
