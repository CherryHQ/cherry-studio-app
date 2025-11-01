import React from 'react'
import { useTranslation } from 'react-i18next'

import { Group, GroupTitle, YStack } from '@/componentsV2'
import { WebsearchProviderRow } from '@/componentsV2/features/SettingsScreen/WebsearchProviderRow'
import { useWebsearchProviders } from '@/hooks/useWebsearchProviders'

export default function ProviderSettings() {
  const { t } = useTranslation()
  const { apiProviders } = useWebsearchProviders()

  return (
    <YStack className="gap-6">
      {/*<YStack className="gap-2">*/}
      {/*  <GroupTitle>{t('settings.websearch.provider.free.title')}</GroupTitle>*/}
      {/*  <Group>*/}
      {/*    {freeProviders.map((provider, index) => (*/}
      {/*      <WebsearchProviderRow key={index} provider={provider} need_config={provider.id === 'searxng'} />*/}
      {/*    ))}*/}
      {/*  </Group>*/}
      {/*</YStack>*/}
      <YStack className="gap-2">
        <GroupTitle>{t('settings.websearch.provider.api.title')}</GroupTitle>
        <Group>
          {apiProviders.map((provider, index) => (
            <WebsearchProviderRow key={index} provider={provider} need_config={true} />
          ))}
        </Group>
      </YStack>
    </YStack>
  )
}
