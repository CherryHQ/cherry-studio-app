import 'react-native-reanimated'
import '@/i18n'

import type { DrawerNavigationOptions } from '@react-navigation/drawer'
import { createDrawerNavigator } from '@react-navigation/drawer'
import React from 'react'

import CustomDrawerContent from '@/componentsV2/features/Menu/CustomDrawerContent'
import AssistantStackNavigator from '@/navigators/AssistantStackNavigator'
import HomeStackNavigator from '@/navigators/HomeStackNavigator'
import { Width } from '@/utils/device'

import McpStackNavigator from './McpStackNavigator'

const Drawer = createDrawerNavigator()

export default function AppDrawerNavigator() {
  return (
    <Drawer.Navigator drawerContent={props => <CustomDrawerContent {...props} />} screenOptions={screenOptions}>
      {/* Main grouped navigators */}
      <Drawer.Screen name="Home" options={options} component={HomeStackNavigator} />
      <Drawer.Screen name="Assistant" options={options} component={AssistantStackNavigator} />
      <Drawer.Screen name="Mcp" options={options} component={McpStackNavigator} />

      {/* Individual screens for backward compatibility */}
      {/*<Drawer.Screen name="ChatScreen" options={options} component={ChatScreen} />
      <Drawer.Screen name="TopicScreen" options={options} component={TopicScreen} />*/}
    </Drawer.Navigator>
  )
}

const screenOptions: DrawerNavigationOptions = {
  drawerStyle: {
    width: Width * 0.8
  },
  swipeEnabled: true,
  drawerType: 'slide',
  keyboardDismissMode: 'none'
}

const options: DrawerNavigationOptions = {
  headerShown: false
}
