import { useNavigation } from '@react-navigation/native'
import { ChevronRight, CloudUpload, FolderSearch2 } from '@tamagui/lucide-icons'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, Text, useTheme, XStack, YStack } from 'tamagui'

import { SettingContainer, SettingGroup, SettingGroupTitle, SettingRow } from '@/components/settings'
import { HeaderBar } from '@/components/settings/HeaderBar'
import { DataBackupIcon } from '@/components/ui/DatabackupIcon'
import SafeAreaContainer from '@/components/ui/SafeAreaContainer'
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
  const theme = useTheme()
  const navigation = useNavigation<NavigationProps>()
  const { t } = useTranslation()

  const settingsItems: SettingGroupConfig[] = [
    {
      title: ' ',
      items: [
        {
          title: t('settings.data.basic_title'),
          screen: 'BasicDataSettingsScreen',
          icon: <FolderSearch2 size={24} />
        }
      ]
    },
    {
      title: t('settings.data.cloud_backup'),
      items: [
        {
          title: 'WebDAV',
          screen: 'WebDavScreen',
          icon: <CloudUpload size={24} />
        },
        {
          title: t('settings.nutstore.config'),
          screen: 'NutstoreLoginScreen',
          icon: <DataBackupIcon provider="nutstore" />
        }
      ]
    },
    {
      title: t('settings.data.third_party'),
      items: [
        {
          title: 'Notion',
          screen: 'NotionSettingsScreen',
          icon: <DataBackupIcon provider="notion" />
        },
        {
          title: 'Yuque',
          screen: 'YuqueSettingsScreen',
          icon: <DataBackupIcon provider="yuque" />
        },
        {
          title: 'Joplin',
          screen: 'JoplinSettingsScreen',
          icon: <DataBackupIcon provider="joplin" />
        },
        {
          title: 'Obsidian',
          screen: 'ObsidianSettingsScreen',
          icon: <DataBackupIcon provider="obsidian" />
        },
        {
          title: 'SiYuan Note',
          screen: 'SiyuanSettingsScreen',
          icon: <DataBackupIcon provider="siyuan" />
        }
      ]
    }
  ]

  return (
    <SafeAreaContainer style={{ flex: 1, backgroundColor: theme.background.val }}>
      <HeaderBar title={t('settings.data.title')} onBackPress={() => navigation.goBack()} />

      <ScrollView flex={1} backgroundColor="$background">
        <SettingContainer>
          <YStack gap={24} flex={1}>
            {settingsItems.map(group => (
              <Group key={group.title} title={group.title}>
                {group.items.map(item => (
                  <SettingItem key={item.title} title={item.title} screen={item.screen} icon={item.icon} />
                ))}
              </Group>
            ))}
          </YStack>
        </SettingContainer>
      </ScrollView>
    </SafeAreaContainer>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <YStack gap={8}>
      {title.trim() !== '' && <SettingGroupTitle>{title}</SettingGroupTitle>}
      <SettingGroup>{children}</SettingGroup>
    </YStack>
  )
}

function SettingItem({ title, screen, icon }: SettingItemProps) {
  const navigation = useNavigation<NavigationProps>()
  return (
    <SettingRow onPress={() => navigation.navigate(screen as any)}>
      <XStack alignItems="center" gap={12}>
        {icon}
        <Text fontSize="$5">{title}</Text>
      </XStack>
      <ChevronRight size={24} color="$colorFocus" />
    </SettingRow>
  )
}

interface SettingItemProps {
  title: string
  screen: string
  icon: React.ReactElement
}
