import { useNavigationState } from '@react-navigation/native'
import { Divider } from 'heroui-native'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Image from '@/componentsV2/base/Image'
import Text from '@/componentsV2/base/Text'
import { Cloud, Globe, HardDrive, Info, Package, Settings2 } from '@/componentsV2/icons/LucideIcon'
import PressableRow from '@/componentsV2/layout/PressableRow'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { navigationRef } from '@/navigators/navigationRef'

export function SettingsSidebar() {
  const { t } = useTranslation()

  // 获取当前路由名称
  const currentRoute = useNavigationState(state => {
    let route = state.routes[state.index] as any
    while (route.state?.routes) {
      route = route.state.routes[route.state.index ?? 0] as any
    }
    return route?.name as string | undefined
  })

  const settingsItems = [
    {
      title: t('settings.modelAndService'),
      items: [
        {
          title: t('settings.provider.title'),
          screen: 'ProvidersSettings',
          specificScreen: 'ProviderListScreen',
          icon: <Cloud size={24} />
        },
        {
          title: t('settings.assistant.title'),
          screen: 'AssistantSettings',
          specificScreen: 'AssistantSettingsScreen',
          icon: <Package size={24} />
        },
        {
          title: t('settings.websearch.title'),
          screen: 'WebSearchSettings',
          specificScreen: 'WebSearchSettingsScreen',
          icon: <Globe size={24} />
        }
      ]
    },
    {
      title: t('settings.title'),
      items: [
        {
          title: t('settings.general.title'),
          screen: 'GeneralSettings',
          specificScreen: 'GeneralSettingsScreen',
          icon: <Settings2 size={24} />
        },
        {
          title: t('settings.data.title'),
          screen: 'DataSourcesSettings',
          specificScreen: 'DataSettingsScreen',
          icon: <HardDrive size={24} />
        }
      ]
    },
    {
      title: t('settings.dataAndSecurity'),
      items: [
        {
          title: t('settings.about.title'),
          screen: 'AboutSettings',
          specificScreen: 'AboutScreen',
          icon: <Info size={24} />
        }
      ]
    }
  ]

  const handlePress = (screen: string, specificScreen?: string) => {
    // 使用全局导航引用，导航路径: Home -> 设置Stack -> 具体设置页面
    if (specificScreen) {
      navigationRef.current?.navigate('Home', {
        screen: screen as any,
        params: { screen: specificScreen }
      })
    } else {
      navigationRef.current?.navigate('Home', { screen: screen as any })
    }
  }

  const isItemActive = (screen: string, specificScreen?: string) => {
    if (specificScreen && currentRoute === specificScreen) return true
    if (currentRoute === screen) return true
    return false
  }

  return (
    <YStack className="m-2 flex-1 gap-2.5 p-2.5">
      {settingsItems.map((group, idx) => (
        <YStack key={idx} className="gap-1.5">
          {group.title && <Text className="text-sm font-medium text-gray-500">{group.title}</Text>}
          <YStack className="gap-0.5">
            {group.items.map((item, itemIdx) => {
              const active = isItemActive(item.screen, item.specificScreen)
              return (
                <PressableRow
                  key={itemIdx}
                  className={`rounded-lg px-2.5 py-2.5 ${active ? 'rounded-full border border-gray-300 bg-gray-200 dark:bg-gray-400' : ''}`}
                  onPress={() => handlePress(item.screen, item.specificScreen)}>
                  <XStack className="items-center justify-between">
                    <XStack className="items-center gap-2.5">
                      {typeof item.icon === 'string' ? (
                        <Image
                          source={item.icon ? { uri: item.icon } : require('@/assets/images/favicon.png')}
                          className="h-6 w-6 rounded-full"
                        />
                      ) : (
                        item.icon
                      )}
                      <Text className={`text-base ${active ? 'font-bold' : ''}`}>{item.title}</Text>
                    </XStack>
                  </XStack>
                </PressableRow>
              )
            })}
          </YStack>
          <Divider />
        </YStack>
      ))}
    </YStack>
  )
}
