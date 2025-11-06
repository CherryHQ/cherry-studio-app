import { databaseMaintenance } from '@database'
import { useNavigation } from '@react-navigation/native'
import { reloadAppAsync } from 'expo'
import * as DocumentPicker from 'expo-document-picker'
import { Paths } from 'expo-file-system'
import * as IntentLauncher from 'expo-intent-launcher'
import * as Sharing from 'expo-sharing'
import { delay } from 'lodash'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'

import {
  Container,
  Group,
  GroupTitle,
  HeaderBar,
  PressableRow,
  RestoreProgressModal,
  RowRightArrow,
  SafeAreaContainer,
  Text,
  XStack,
  YStack
} from '@/componentsV2'
import { FileText, Folder, FolderOpen, RotateCcw, Save, Trash2 } from '@/componentsV2/icons/LucideIcon'
import { useDialog } from '@/hooks/useDialog'
import { DEFAULT_RESTORE_STEPS, useRestore } from '@/hooks/useRestore'
import { backup } from '@/services/BackupService'
import { getCacheDirectorySize, resetCacheDirectory, shareFile } from '@/services/FileService'
import { loggerService } from '@/services/LoggerService'
import { persistor } from '@/store'
import type { NavigationProps } from '@/types/naviagate'
import { formatFileSize } from '@/utils/file'
const logger = loggerService.withContext('BasicDataSettingsScreen')

interface SettingItemConfig {
  title: string
  screen?: string
  icon: React.ReactElement
  subtitle?: string
  danger?: boolean
  onPress?: () => void
  disabled?: boolean
}

interface SettingGroupConfig {
  title: string
  items: SettingItemConfig[]
}

export default function BasicDataSettingsScreen() {
  const { t } = useTranslation()
  const dialog = useDialog()
  const [isResetting, setIsResetting] = useState(false)
  const [isBackup, setIsBackup] = useState(false)
  const [cacheSize, setCacheSize] = useState<string>('--')
  const { isModalOpen, restoreSteps, overallStatus, startRestore, closeModal } = useRestore({
    stepConfigs: DEFAULT_RESTORE_STEPS,
    clearBeforeRestore: true
  })

  const loadCacheSize = async () => {
    try {
      const size = await getCacheDirectorySize()
      setCacheSize(formatFileSize(size))
    } catch (error) {
      logger.error('loadCacheSize', error as Error)
      setCacheSize('--')
    }
  }

  useEffect(() => {
    loadCacheSize()
  }, [isBackup])

  const handleBackup = async () => {
    try {
      setIsBackup(true)
      const backupUri = await backup()
      setIsBackup(false)
      await shareFile(backupUri)
    } catch (error) {
      logger.error('handleBackup', error as Error)
    }
  }

  const handleRestore = async () => {
    dialog.open({
      type: 'warning',
      title: t('settings.data.restore.title'),
      content: t('settings.data.restore.confirm_warning'),
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel'),
      showLoading: true,
      onConFirm: async () => {
        const result = await DocumentPicker.getDocumentAsync({ type: 'application/zip' })
        if (result.canceled) return

        const asset = result.assets[0]
        await startRestore({
          name: asset.name,
          uri: asset.uri,
          size: asset.size,
          mimeType: asset.mimeType
        })
      }
    })
  }

  const handleDataReset = async () => {
    if (isResetting) return

    dialog.open({
      type: 'warning',
      title: t('settings.data.reset'),
      content: t('settings.data.reset_warning'),
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel'),
      showLoading: true,
      onConFirm: async () => {
        setIsResetting(true)

        try {
          await databaseMaintenance.resetDatabase() // reset sqlite
          await persistor.purge() // reset redux
          await resetCacheDirectory() // reset cache

          delay(async () => await reloadAppAsync(), 200)
        } catch (error) {
          setIsResetting(false)
          dialog.open({
            type: 'error',
            title: t('common.error'),
            content: t('settings.data.data_reset.error')
          })
          logger.error('handleDataReset', error as Error)
        }
      }
    })
  }

  const handleClearCache = async () => {
    if (isResetting) return

    dialog.open({
      type: 'warning',
      title: t('settings.data.clear_cache.title'),
      content: t('settings.data.clear_cache.warning'),
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onConFirm: async () => {
        setIsResetting(true)

        try {
          await resetCacheDirectory() // reset cache
          await loadCacheSize() // refresh cache size after clearing
        } catch (error) {
          dialog.open({
            type: 'error',
            title: t('common.error'),
            content: t('settings.data.clear_cache.error')
          })
          logger.error('handleDataReset', error as Error)
        } finally {
          setIsResetting(false)
        }
      }
    })
  }

  const handleOpenAppData = async () => {
    try {
      if (Platform.OS === 'android') {
        // Open file manager on Android
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: Paths.document.uri,
          type: 'resource/folder'
        })
      } else {
        // On iOS, we can only share the directory info
        dialog.open({
          type: 'info',
          title: t('settings.data.app_data'),
          content: `${t('settings.data.app_data_location')}: ${Paths.document.uri}`
        })
      }
    } catch (error) {
      logger.error('handleOpenAppData', error as Error)
      dialog.open({
        type: 'info',
        title: t('settings.data.app_data'),
        content: `${t('settings.data.app_data_location')}: ${Paths.document.uri}`
      })
    }
  }

  const handleOpenAppLogs = async () => {
    try {
      const logPath = Paths.join(Paths.document.uri, 'app.log')

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(logPath)
      } else {
        dialog.open({
          type: 'info',
          title: t('settings.data.app_logs'),
          content: `${t('settings.data.log_location')}: ${logPath}`
        })
      }
    } catch (error) {
      logger.error('handleOpenAppLogs', error as Error)
      const logPath = Paths.join(Paths.document.uri, 'app.log')
      dialog.open({
        type: 'info',
        title: t('settings.data.app_logs'),
        content: `${t('settings.data.log_location')}: ${logPath}`
      })
    }
  }

  const settingsItems: SettingGroupConfig[] = [
    {
      title: t('settings.data.title'),
      items: [
        {
          title: t('settings.data.backup'),
          icon: <Save size={24} />,
          onPress: handleBackup
        },
        {
          title: t('settings.data.restore.title'),
          icon: <Folder size={24} />,
          onPress: handleRestore
        },
        {
          title: isResetting ? t('common.loading') : t('settings.data.reset'),
          icon: <RotateCcw size={24} className="text-red-500 dark:text-red-500" />,
          danger: true,
          onPress: handleDataReset,
          disabled: isResetting
        }
      ]
    },
    {
      title: t('settings.data.data.title'),
      items: [
        {
          title: t('settings.data.app_data'),
          icon: <FolderOpen size={24} />,
          onPress: handleOpenAppData
        },
        {
          title: t('settings.data.app_logs'),
          icon: <FileText size={24} />,
          onPress: handleOpenAppLogs
        },
        {
          title: t('settings.data.clear_cache.button', { cacheSize }),
          icon: <Trash2 size={24} className="text-red-500 dark:text-red-500" />,
          danger: true,
          onPress: handleClearCache
        }
      ]
    }
  ]

  return (
    <SafeAreaContainer>
      <HeaderBar title={t('settings.data.basic_title')} />

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

      <RestoreProgressModal
        isOpen={isModalOpen}
        steps={restoreSteps}
        overallStatus={overallStatus}
        onClose={closeModal}
      />
    </SafeAreaContainer>
  )
}

function GroupContainer({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <YStack className="gap-2">
      <GroupTitle>{title}</GroupTitle>
      <Group>{children}</Group>
    </YStack>
  )
}

function SettingItem({ title, screen, icon, subtitle, danger, onPress, disabled }: SettingItemConfig) {
  const navigation = useNavigation<NavigationProps>()

  const handlePress = () => {
    if (disabled) return

    if (onPress) {
      onPress()
    } else if (screen) {
      navigation.navigate(screen as any)
    }
  }

  return (
    <PressableRow onPress={handlePress} style={{ opacity: disabled ? 0.5 : 1 }}>
      <XStack className="items-center gap-3">
        {icon}
        <YStack>
          <Text className={danger ? 'text-red-500' : ''}>{title}</Text>
          {subtitle && <Text className="text-sm">{subtitle}</Text>}
        </YStack>
      </XStack>
      {screen && <RowRightArrow />}
    </PressableRow>
  )
}
