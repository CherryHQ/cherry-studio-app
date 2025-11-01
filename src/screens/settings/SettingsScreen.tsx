import { useNavigation } from '@react-navigation/native'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { GestureDetector } from 'react-native-gesture-handler'

import {
  Image,
  Text,
  XStack,
  YStack,
  SafeAreaContainer,
  HeaderBar,
  Container,
  Group,
  PressableRow,
  GroupTitle,
  RowRightArrow
} from '@/componentsV2'
import { Cloud, Package, Globe, Settings2, HardDrive, Info } from '@/componentsV2/icons/LucideIcon'
import { useSettings } from '@/hooks/useSettings'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'
import { HomeNavigationProps } from '@/types/naviagate'

interface SettingItemConfig {
  title: string
  screen: string
  icon: React.ReactElement | string
  specificScreen?: string // For nested navigation to specific screen
}

interface SettingGroupConfig {
  title?: string
  items: SettingItemConfig[]
}

export default function SettingsScreen() {
  const { t } = useTranslation()
  const { avatar, userName } = useSettings()
  const panGesture = useSwipeGesture()

  const settingsItems: SettingGroupConfig[] = [
    {
      items: [
        {
          title: userName,
          screen: 'AboutSettings',
          specificScreen: 'PersonalScreen',
          icon: avatar
        }
      ]
    },
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

  return (
    <SafeAreaContainer className="flex-1">
      <GestureDetector gesture={panGesture}>
        <View collapsable={false} className="flex-1">
          <HeaderBar title={t('settings.title')} />

          <Container>
            <YStack className="flex-1 gap-6">
              {settingsItems.map((group, index) => (
                <SettingGroup key={index} title={group.title}>
                  {group.items.map((item, index) => (
                    <SettingItem
                      key={index}
                      title={item.title}
                      screen={item.screen}
                      icon={item.icon}
                      specificScreen={item.specificScreen}
                    />
                  ))}
                </SettingGroup>
              ))}
            </YStack>
          </Container>
        </View>
      </GestureDetector>
    </SafeAreaContainer>
  )
}

interface SettingGroupProps {
  title?: string
  children: React.ReactNode
}

function SettingGroup({ title, children }: SettingGroupProps) {
  return (
    <YStack className="gap-2">
      {title && <GroupTitle>{title}</GroupTitle>}
      <Group>{children}</Group>
    </YStack>
  )
}

interface SettingItemProps {
  title: string
  screen: string
  icon: React.ReactElement | string
  specificScreen?: string
}

function SettingItem({ title, screen, icon, specificScreen }: SettingItemProps) {
  const navigation = useNavigation<HomeNavigationProps>()

  const renderIcon = () => {
    if (typeof icon === 'string') {
      return (
        <Image
          source={icon ? { uri: icon } : require('@/assets/images/favicon.png')}
          className="h-10 w-10 rounded-full"
          accessibilityLabel={title}
        />
      )
    }

    return icon
  }

  const handlePress = () => {
    if (specificScreen) {
      // Navigate to nested screen with initial route
      navigation.navigate(screen as any, { screen: specificScreen })
    } else {
      // Navigate directly to the stack navigator
      navigation.navigate(screen as any)
    }
  }

  return (
    <PressableRow onPress={handlePress}>
      <XStack className="items-center gap-3">
        {renderIcon()}
        <YStack>
          <Text className="font-bold">{title}</Text>
        </YStack>
      </XStack>
      <RowRightArrow />
    </PressableRow>
  )
}
