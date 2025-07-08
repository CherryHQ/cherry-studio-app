import React from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from 'react-native'

import { useDataBackupProvider } from '@/hooks/useDataBackup'
import ProviderSettingsScreen, { ProviderConfig } from '@/screens/settings/data/DataProviderSettingsScreen'

export default function JoplinSettingsScreen() {
  const { t } = useTranslation()
  const { provider } = useDataBackupProvider('joplin')

  async function checkConnection() {
    console.log('Checking Joplin connection...')

    if (!provider || !provider.joplinUrl) {
      Alert.alert(t('settings.data.yuque.check.empty_url'))
      return
    }

    if (!provider || !provider.joplinToken) {
      Alert.alert(t('settings.data.yuque.check.empty_token'))
      return
    }

    try {
      const response = await fetch(`${provider.joplinUrl}notes?limit=1&token=${provider.joplinToken}`)
      const data = await response.json()

      if (!response.ok || data?.error) {
        Alert.alert(t('settings.joplin.check.fail'))
        return
      }

      Alert.alert(t('settings.joplin.check.success'))
    } catch (error) {
      Alert.alert(t('settings.joplin.check.fail'))
      throw error
    }
  }

  const config: ProviderConfig = {
    providerType: 'joplin',
    titleKey: 'settings.joplin.title',
    fields: [
      {
        type: 'input',
        key: 'joplinUrl',
        titleKey: 'settings.joplin.url',
        placeholderKey: 'settings.joplin.url_placeholder'
      },
      {
        type: 'password',
        key: 'joplinToken',
        titleKey: 'settings.joplin.token',
        placeholderKey: 'settings.joplin.token_placeholder',
        helpUrl: 'https://joplinapp.org/help/apps/clipper',
        helpTextKey: 'settings.joplin.help'
      },
      {
        type: 'switch',
        key: 'joplinExportReasoning',
        titleKey: 'settings.notion.export_reasoning.title',
        descriptionKey: 'settings.notion.export_reasoning.help'
      }
    ],
    checkConnectionFn: checkConnection
  }

  return <ProviderSettingsScreen config={config} />
}
