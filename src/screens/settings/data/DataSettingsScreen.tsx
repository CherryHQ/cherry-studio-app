import { useNavigation } from '@react-navigation/native'
import React from 'react'
import { useTranslation } from 'react-i18next'

import {
  Container,
  Group,
  GroupTitle,
  HeaderBar,
  PressableRow,
  RowRightArrow,
  SafeAreaContainer,
  Text,
  XStack,
  YStack
} from '@/componentsV2'
import { FolderSearch2, Wifi } from '@/componentsV2/icons/LucideIcon'
import { useDialog } from '@/hooks/useDialog'
import type { NavigationProps } from '@/types/naviagate'

interface SettingItemConfig {
  title: string
  screen?: string
  icon: React.ReactElement
  onPress?: () => void
}

interface SettingGroupConfig {
  title: string
  items: SettingItemConfig[]
}

export default function DataSettingsScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<NavigationProps>()
  const dialog = useDialog()

  const handleLandrop = () => {
    dialog.open({
      type: 'warning',
      title: t('settings.data.landrop.title'),
      content: t('settings.data.landrop.confirm_warning'),
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onConFirm: () => {
        navigation.navigate('HomeScreen', {
          screen: 'Home',
          params: {
            screen: 'DataSourcesSettings',
            params: {
              screen: 'LandropSettingsScreen'
            }
          }
        })
      }
    })
  }

  const settingsItems: SettingGroupConfig[] = [
    {
      title: ' ',
      items: [
        {
          title: t('settings.data.basic_title'),
          screen: 'BasicDataSettingsScreen',
          icon: <FolderSearch2 size={24} />
        },
        {
          title: t('settings.data.landrop.title'),
          icon: <Wifi size={24} />,
          onPress: handleLandrop
        }
      ]
    }
    // {
    //   title: t('settings.data.cloud_backup'),
    //   items: [
    //     {
    //       title: 'WebDAV',
    //       screen: 'WebDavScreen',
    //       icon: <CloudUpload size={24} />
    //     },
    //     {
    //       title: t('settings.nutstore.config'),
    //       screen: 'NutstoreLoginScreen',
    //       icon: <DataBackupIcon provider="nutstore" />
    //     }
    //   ]
    // },
    // {
    //   title: t('settings.data.third_party'),
    //   items: [
    //     {
    //       title: 'Notion',
    //       screen: 'NotionSettingsScreen',
    //       icon: <DataBackupIcon provider="notion" />
    //     },
    //     {
    //       title: 'Yuque',
    //       screen: 'YuqueSettingsScreen',
    //       icon: <DataBackupIcon provider="yuque" />
    //     },
    //     {
    //       title: 'Joplin',
    //       screen: 'JoplinSettingsScreen',
    //       icon: <DataBackupIcon provider="joplin" />
    //     },
    //     {
    //       title: 'Obsidian',
    //       screen: 'ObsidianSettingsScreen',
    //       icon: <DataBackupIcon provider="obsidian" />
    //     },
    //     {
    //       title: 'SiYuan Note',
    //       screen: 'SiyuanSettingsScreen',
    //       icon: <DataBackupIcon provider="siyuan" />
    //     }
    //   ]
    // }
  ]

  return (
    <SafeAreaContainer>
      <HeaderBar title={t('settings.data.title')} />

      <YStack className="flex-1">
        <Container>
          <YStack className="flex-1 gap-6">
            {settingsItems.map(group => (
              <GroupContainer key={group.title} title={group.title}>
                {group.items.map(item => (
                  <SettingItem key={item.title} {...item} />
                ))}
              </GroupContainer>
            ))}
          </YStack>
        </Container>
      </YStack>
    </SafeAreaContainer>
  )
}

function GroupContainer({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <YStack className="gap-2">
      {title.trim() !== '' && <GroupTitle>{title}</GroupTitle>}
      <Group>{children}</Group>
    </YStack>
  )
}

function SettingItem({ title, screen, icon, onPress }: SettingItemProps) {
  const navigation = useNavigation<NavigationProps>()

  const handlePress = () => {
    if (onPress) {
      onPress()
    } else if (screen) {
      navigation.navigate(screen as any)
    }
  }

  return (
    <PressableRow onPress={handlePress}>
      <XStack className="items-center gap-3">
        {icon}
        <Text>{title}</Text>
      </XStack>
      {(screen || onPress) && <RowRightArrow />}
    </PressableRow>
  )
}

interface SettingItemProps {
  title: string
  screen?: string
  icon: React.ReactElement
  onPress?: () => void
}
