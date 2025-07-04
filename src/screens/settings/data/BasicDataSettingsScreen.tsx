import { useNavigation } from '@react-navigation/native'
import { ChevronRight, FileText, Folder, FolderOpen, RotateCcw, Save, Trash2 } from '@tamagui/lucide-icons'
import * as DocumentPicker from 'expo-document-picker'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, Text, useTheme, XStack, YStack } from 'tamagui'

import { SettingContainer, SettingGroup, SettingGroupTitle, SettingRow } from '@/components/settings'
import { HeaderBar } from '@/components/settings/HeaderBar'
import SafeAreaContainer from '@/components/ui/SafeAreaContainer'
import { restore } from '@/services/BackupService'
import { FileType } from '@/types/file'
import { NavigationProps } from '@/types/naviagate'
import { uuid } from '@/utils'
import { getFileType } from '@/utils/file'

interface SettingItemConfig {
  title: string
  screen?: string
  icon: React.ReactElement
  subtitle?: string
  danger?: boolean
  onPress?: () => void
}

interface SettingGroupConfig {
  title: string
  items: SettingItemConfig[]
}

export default function BasicDataSettingsScreen() {
  const theme = useTheme()
  const navigation = useNavigation<NavigationProps>()
  const { t } = useTranslation()

  const handleRestore = async () => {
    // 处理恢复数据逻辑
    console.log('Data restore pressed')

    try {
      const result = await DocumentPicker.getDocumentAsync()

      if (result.canceled) return console.log('File selection was canceled')

      const asset = result.assets[0]

      console.log('Selected file:', asset.name)

      if (!['.zip', '.bak'].some(ext => asset.name.endsWith(ext))) throw new TypeError('Invalid file type')

      const file: Omit<FileType, 'md5'> = {
        id: uuid(),
        name: asset.name,
        origin_name: asset.name,
        path: asset.uri,
        size: asset.size || 0,
        ext: asset.name.split('.').pop() || '',
        type: getFileType(asset.name.split('.').pop() || ''),
        mime_type: asset.mimeType || '',
        created_at: new Date().toISOString(),
        count: 1
      }

      console.log('Selected file:', file)

      await restore(file)
    } catch (err) {
      console.log('Error selecting file:', err)
    }
  }

  const settingsItems: SettingGroupConfig[] = [
    {
      title: t('settings.data.title'),
      items: [
        {
          title: t('settings.data.backup'),
          icon: <Save size={24} />,
          onPress: () => {}
        },
        {
          title: t('settings.data.recovery'),
          icon: <Folder size={24} />,
          onPress: handleRestore
        },
        {
          title: t('settings.data.reset'),
          icon: <RotateCcw size={24} color="red" />,
          danger: true,
          onPress: () => {
            // 处理数据重置逻辑
            console.log('Data reset pressed')
          }
        }
      ]
    },
    {
      title: t('settings.data.data.title'),
      items: [
        {
          title: t('settings.data.app_data'),
          icon: <FolderOpen size={24} />,
          subtitle: 'My phone/Cherry'
        },
        {
          title: t('settings.data.app_logs'),
          icon: <FileText size={24} />,
          subtitle: 'My phone/Cherry/Logs'
        },
        {
          title: t('settings.data.clear_cache.button'),
          icon: <Trash2 size={24} color="red" />,
          danger: true,
          onPress: () => {
            // 处理清除缓存逻辑
            console.log('Clear cache pressed')
          }
        }
      ]
    }
  ]

  return (
    <SafeAreaContainer style={{ flex: 1, backgroundColor: theme.background.val }}>
      <HeaderBar title={t('settings.data.basic_title')} onBackPress={() => navigation.goBack()} />

      <ScrollView flex={1} backgroundColor="$background">
        <SettingContainer>
          <YStack gap={24} flex={1}>
            {settingsItems.map(group => (
              <Group key={group.title} title={group.title}>
                {group.items.map(item => (
                  <SettingItem
                    key={item.title}
                    title={item.title}
                    screen={item.screen}
                    icon={item.icon}
                    subtitle={item.subtitle}
                    danger={item.danger}
                    onPress={item.onPress}
                  />
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
      <SettingGroupTitle>{title}</SettingGroupTitle>
      <SettingGroup>{children}</SettingGroup>
    </YStack>
  )
}

function SettingItem({ title, screen, icon, subtitle, danger, onPress }: SettingItemProps) {
  const navigation = useNavigation<NavigationProps>()

  const handlePress = () => {
    if (onPress) {
      onPress()
    } else if (screen) {
      navigation.navigate(screen as any)
    }
  }

  return (
    <SettingRow onPress={handlePress}>
      <XStack alignItems="center" gap={12}>
        {icon}
        <YStack>
          <Text fontSize="$5" color={danger ? 'red' : undefined}>
            {title}
          </Text>
          {subtitle && (
            <Text theme="alt2" fontSize="$2">
              {subtitle}
            </Text>
          )}
        </YStack>
      </XStack>
      {screen && <ChevronRight size={24} color="$colorFocus" />}
    </SettingRow>
  )
}

interface SettingItemProps {
  title: string
  screen?: string
  icon: React.ReactElement
  subtitle?: string
  danger?: boolean
  onPress?: () => void
}
