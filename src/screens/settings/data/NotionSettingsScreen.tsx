import { Client } from '@notionhq/client'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from 'react-native'

import { useDataBackupProvider } from '@/hooks/useDataBackup'
import ProviderSettingsScreen, { ProviderConfig } from '@/screens/settings/data/DataProviderSettingsScreen'

export default function NotionSettingsScreen() {
  const { t } = useTranslation()
  const { provider } = useDataBackupProvider('notion')

  async function checkConnection() {
    console.log('Checking Notion connection...')

    if (!provider || !provider.notionApiKey) {
      Alert.alert(t('settings.notion.check.empty_api_key'))
      return
    }

    if (!provider.notionDatabaseID) {
      Alert.alert(t('settings.notion.check.empty_database_id'))
      return
    }

    try {
      const notion = new Client({ auth: provider.notionApiKey })
      const result = await notion.databases.retrieve({
        database_id: provider.notionDatabaseID
      })

      if (result) {
        Alert.alert(t('settings.notion.check.success'))
      } else {
        Alert.alert(t('settings.notion.check.fail'))
      }
    } catch (error) {
      Alert.alert(t('settings.notion.check.error'))
      throw error
    }
  }

  const config: ProviderConfig = {
    providerType: 'notion',
    titleKey: 'settings.notion.title',
    fields: [
      {
        type: 'input',
        key: 'notionDatabaseID',
        titleKey: 'settings.notion.database_id',
        placeholderKey: 'settings.notion.database_id_placeholder'
      },
      {
        type: 'password',
        key: 'notionApiKey',
        titleKey: 'settings.notion.api_key',
        placeholderKey: 'settings.notion.api_key_placeholder',
        helpUrl: 'https://docs.cherry-ai.com/advanced-basic/notion',
        helpTextKey: 'settings.notion.help'
      },
      {
        type: 'input',
        key: 'notionPageNameKey',
        titleKey: 'settings.notion.page_name_key',
        placeholderKey: 'settings.notion.page_name_key_placeholder'
      },
      {
        type: 'switch',
        key: 'notionExportReasoning',
        titleKey: 'settings.notion.export_reasoning.title',
        descriptionKey: 'settings.notion.export_reasoning.help'
      }
    ],
    checkConnectionFn: checkConnection
  }

  return <ProviderSettingsScreen config={config} />
}
