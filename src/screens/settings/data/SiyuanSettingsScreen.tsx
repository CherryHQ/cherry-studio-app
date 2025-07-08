import React from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from 'react-native'

import { useDataBackupProvider } from '@/hooks/useDataBackup'
import ProviderSettingsScreen, { ProviderConfig } from '@/screens/settings/data/DataProviderSettingsScreen'

export default function SiyuanSettingsScreen() {
  const { t } = useTranslation()
  const { provider } = useDataBackupProvider('siyuan')

  async function checkConnection() {
    console.log('Checking Siyuan connection...')

    if (!provider || !provider.siyuanApiUrl || !provider.siyuanToken) {
      Alert.alert(t('settings.siyuan.check.empty_config'))
      return
    }

    try {
      const response = await fetch(`${provider.siyuanApiUrl}/api/notebook/lsNotebooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${provider.siyuanToken}`
        }
      })

      if (!response.ok) {
        Alert.alert(t('settings.siyuan.check.fail'))
        return
      }

      const data = await response.json()

      if (data.code !== 0) {
        Alert.alert(t('settings.siyuan.check.fail'))
        return
      }

      Alert.alert(t('settings.siyuan.check.success'))
    } catch (error) {
      Alert.alert(t('settings.siyuan.check.fail'))
      throw error
    }
  }

  const config: ProviderConfig = {
    providerType: 'siyuan',
    titleKey: 'settings.siyuan.title',
    fields: [
      {
        type: 'input',
        key: 'siyuanApiUrl',
        titleKey: 'settings.siyuan.api_url',
        placeholderKey: 'settings.siyuan.api_url_placeholder'
      },
      {
        type: 'password',
        key: 'siyuanToken',
        titleKey: 'settings.siyuan.token',
        placeholderKey: 'settings.siyuan.token_placeholder',
        helpUrl: 'https://docs.cherry-ai.com/advanced-basic/siyuan',
        helpTextKey: 'settings.siyuan.token.help'
      },
      {
        type: 'input',
        key: 'siyuanBoxId',
        titleKey: 'settings.siyuan.box_id',
        placeholderKey: 'settings.siyuan.box_id_placeholder'
      },
      {
        type: 'input',
        key: 'siyuanRootPath',
        titleKey: 'settings.siyuan.root_path',
        placeholderKey: 'settings.siyuan.root_path_placeholder'
      }
    ],
    checkConnectionFn: checkConnection
  }

  return <ProviderSettingsScreen config={config} />
}
