import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs'
import type { RouteProp } from '@react-navigation/native'
import { useRoute } from '@react-navigation/native'
import { cn } from 'heroui-native'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { TouchableOpacity, View } from 'react-native'

import { Text } from '@/componentsV2'
import type { AssistantStackParamList } from '@/navigators/AssistantStackNavigator'
import ModelTabScreen from '@/screens/assistant/tabs/ModelTabScreen'
import PromptTabScreen from '@/screens/assistant/tabs/PromptTabScreen'
import ToolTabScreen from '@/screens/assistant/tabs/ToolTabScreen'
import type { Assistant } from '@/types/assistant'

export type AssistantDetailTabParamList = {
  PromptTab: { assistant: Assistant }
  ModelTab: { assistant: Assistant }
  ToolTab: { assistant: Assistant }
}

const Tab = createMaterialTopTabNavigator<AssistantDetailTabParamList>()

type AssistantDetailRouteProp = RouteProp<AssistantStackParamList, 'AssistantDetailScreen'>

interface AssistantDetailTabNavigatorProps {
  assistant: Assistant
}

function CustomTabBar({ state, navigation }: any) {
  const { t } = useTranslation()

  const tabLabels = {
    PromptTab: t('common.prompt'),
    ModelTab: t('common.model'),
    ToolTab: t('common.tool')
  }

  return (
    <View className="mx-[5px] my-1 flex-row gap-[5px] rounded-2xl border border-neutral-300/20 bg-transparent px-1 py-1">
      {state.routes.map((route: any, index: number) => {
        const isFocused = state.index === index

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true
          })

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params)
          }
        }

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            className={cn('flex-1 items-center justify-center rounded-xl px-5 py-3', isFocused && 'bg-green-20')}>
            <Text className={cn('text-xs font-bold', isFocused && 'text-green-100')}>
              {tabLabels[route.name as keyof typeof tabLabels]}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

export default function AssistantDetailTabNavigator({ assistant }: AssistantDetailTabNavigatorProps) {
  const { t } = useTranslation()
  const route = useRoute<AssistantDetailRouteProp>()
  const { tab } = route.params

  return (
    <Tab.Navigator
      initialRouteName={getInitialTabRoute(tab)}
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{
        swipeEnabled: true,
        animationEnabled: true
      }}>
      <Tab.Screen
        name="PromptTab"
        component={PromptTabScreen}
        options={{
          tabBarLabel: t('common.prompt')
        }}
        initialParams={{ assistant }}
      />
      <Tab.Screen
        name="ModelTab"
        component={ModelTabScreen}
        options={{
          tabBarLabel: t('common.model')
        }}
        initialParams={{ assistant }}
      />
      <Tab.Screen
        name="ToolTab"
        component={ToolTabScreen}
        options={{
          tabBarLabel: t('common.tool')
        }}
        initialParams={{ assistant }}
      />
    </Tab.Navigator>
  )
}

function getInitialTabRoute(tab?: string): keyof AssistantDetailTabParamList {
  switch (tab) {
    case 'prompt':
      return 'PromptTab'
    case 'model':
      return 'ModelTab'
    case 'tool':
      return 'ToolTab'
    default:
      return 'PromptTab'
  }
}
