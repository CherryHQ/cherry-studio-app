import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

import { Container, Group, GroupTitle, HeaderBar, SafeAreaContainer, SelectionDropdown, YStack } from '@/componentsV2'
import Text from '@/componentsV2/base/Text'
import { SpeechToTextProviderRow } from '@/componentsV2/features/SettingsScreen/speechToText/SpeechToTextProviderRow'
import { ChevronsUpDown } from '@/componentsV2/icons'
import { usePreference } from '@/hooks/usePreference'
import { useSpeechToTextProviders } from '@/hooks/useSpeechToTextProviders'

export default function SpeechToTextSettingScreen() {
  const { t } = useTranslation()
  const [currentProvider, setCurrentProvider] = usePreference('speechToTextProvider' as any)
  const { providers, apiProviders } = useSpeechToTextProviders()

  const handleProviderSelect = (providerId: string) => {
    setCurrentProvider(providerId)
  }

  const currentProviderLabel = currentProvider ? t(`settings.speechToText.provider.${currentProvider}`) : providers[0]?.name || ''

  return (
    <SafeAreaContainer className="flex-1">
      <View collapsable={false} className="flex-1">
        <HeaderBar title={t('settings.speechToText.title')} />

        <Container>
          <YStack className="flex-1 gap-6">
            <YStack className="gap-2">
              <GroupTitle>提供商</GroupTitle>
              <Group>
                <SelectionDropdown
                  items={providers.map(provider => ({
                    id: provider.id,
                    label: t(`settings.speechToText.provider.${provider.id}`),
                    isSelected: currentProvider === provider.id,
                    onSelect: () => handleProviderSelect(provider.id)
                  }))}>
                  <Pressable className="bg-card flex-row items-center justify-between px-3 py-4 active:opacity-80">
                    <Text className="text-foreground text-[14px]">{currentProviderLabel}</Text>
                    <ChevronsUpDown size={16} />
                  </Pressable>
                </SelectionDropdown>
              </Group>
            </YStack>

            <YStack className="gap-2">
              <GroupTitle>{t('settings.speechToText.provider.api.title')}</GroupTitle>
              <Group>
                {apiProviders.map((provider, index) => (
                  <SpeechToTextProviderRow
                    key={index}
                    provider={provider}
                    isSelected={currentProvider === provider.id}
                  />
                ))}
              </Group>
            </YStack>
          </YStack>
        </Container>
      </View>
    </SafeAreaContainer>
  )
}
