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
import { NavigationProps } from '@/types/naviagate'

interface SettingItemConfig {
  title: string
  screen: string
  icon: React.ReactElement
}

interface SettingGroupConfig {
  title: string
  items: SettingItemConfig[]
}

export default function DataSettingsScreen() {
  const { t } = useTranslation()

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
          screen: 'LandropSettingsScreen',
          icon: <Wifi size={24} />
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
    <SafeAreaContainer style={{ flex: 1 }}>
      <HeaderBar title={t('settings.data.title')} />

      <YStack className="flex-1">
        <Container>
          <YStack className="flex-1 gap-6">
            {settingsItems.map(group => (
              <GroupContainer key={group.title} title={group.title}>
                {group.items.map(item => (
                  <SettingItem key={item.title} title={item.title} screen={item.screen} icon={item.icon} />
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

function SettingItem({ title, screen, icon }: SettingItemProps) {
  const navigation = useNavigation<NavigationProps>()
  return (
    <PressableRow onPress={() => navigation.navigate(screen as any)}>
      <XStack className="items-center gap-3">
        {icon}
        <Text>{title}</Text>
      </XStack>
      <RowRightArrow />
    </PressableRow>
  )
}

interface SettingItemProps {
  title: string
  screen: string
  icon: React.ReactElement
}
