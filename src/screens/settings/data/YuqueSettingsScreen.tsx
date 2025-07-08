import React from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from 'react-native'

import { useDataBackupProvider } from '@/hooks/useDataBackup'
import ProviderSettingsScreen, { ProviderConfig } from '@/screens/settings/data/DataProviderSettingsScreen'

export default function YuqueSettingsScreen() {
  const { t } = useTranslation()
  const { provider, updateProvider } = useDataBackupProvider('yuque')

  async function checkConnection() {
    console.log('Checking Yuque connection...')

    if (!provider || !provider.yuqueToken) {
      Alert.alert(t('settings.data.yuque.check.empty_token'))
      return
    }

    if (!provider || !provider.yuqueUrl) {
      Alert.alert(t('settings.data.yuque.check.empty_url'))
      return
    }

    const response = await fetch('https://www.yuque.com/api/v2/hello', {
      headers: {
        'X-Auth-Token': provider.yuqueToken
      }
    })

    if (!response.ok) {
      Alert.alert(t('settings.yuque.check.fail'))
      return
    }

    const yuqueSlug = provider.yuqueUrl.replace('https://www.yuque.com/', '')
    const repoIDResponse = await fetch(`https://www.yuque.com/api/v2/repos/${yuqueSlug}`, {
      headers: {
        'X-Auth-Token': provider.yuqueToken
      }
    })

    if (!repoIDResponse.ok) {
      Alert.alert(t('settings.yuque.check.fail'))
      return
    }

    const data = await repoIDResponse.json()
    await updateProvider({
      ...provider,
      yuqueRepoId: data.data.id
    })
    Alert.alert(t('settings.yuque.check.success'))
  }

  const config: ProviderConfig = {
    providerType: 'yuque',
    titleKey: 'settings.yuque.title',
    fields: [
      {
        type: 'input',
        key: 'yuqueUrl',
        titleKey: 'settings.yuque.repo_url',
        placeholderKey: 'settings.yuque.repo_url_placeholder'
      },
      {
        type: 'password',
        key: 'yuqueToken',
        titleKey: 'settings.yuque.token',
        placeholderKey: 'settings.yuque.token_placeholder',
        helpUrl: 'https://www.yuque.com/settings/tokens',
        helpTextKey: 'settings.yuque.help'
      }
    ],
    checkConnectionFn: checkConnection
  }

  return <ProviderSettingsScreen config={config} />
}
