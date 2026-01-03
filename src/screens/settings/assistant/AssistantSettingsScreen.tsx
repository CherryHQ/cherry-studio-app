import { useNavigation } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import { Button } from 'heroui-native'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'

import { Container, HeaderBar, IconButton, Image, SafeAreaContainer, Text, XStack, YStack } from '@/componentsV2'
import { presentModelSheet } from '@/componentsV2/features/Sheet/ModelSheet'
import { ChevronDown, Languages, MessageSquareMore, Rocket, Settings2 } from '@/componentsV2/icons/LucideIcon'
import { useAssistant } from '@/hooks/useAssistant'
import { useProvider } from '@/hooks/useProviders'
import { useTheme } from '@/hooks/useTheme'
import type { AssistantSettingsStackParamList } from '@/navigators/settings/AssistantSettingsStackNavigator'
import type { Assistant, Model } from '@/types/assistant'
import { getModelOrProviderIcon } from '@/utils/icons'
import { getBaseModelName } from '@/utils/naming'

function ModelPicker({ assistant, onPress }: { assistant: Assistant; onPress: () => void }) {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const model = assistant?.defaultModel
  const providerId = model?.provider ?? ''
  const { provider } = useProvider(providerId)
  const providerDisplayName = providerId
    ? t(`provider.${providerId}`, { defaultValue: provider?.name ?? providerId })
    : (provider?.name ?? providerId)

  return (
    <Button
      pressableFeedbackVariant="ripple"
      variant="ghost"
      className="bg-card  w-full justify-between rounded-2xl px-3"
      onPress={onPress}>
      <Button.Label className="min-w-0 flex-1">
        <XStack className="min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {model ? (
            <>
              <Image
                className="h-[18px] w-[18px] rounded-full"
                source={getModelOrProviderIcon(model.id, model.provider, isDark)}
              />
              <Text numberOfLines={1} ellipsizeMode="tail" className="min-w-0 max-w-[55%] flex-1 font-medium">
                {getBaseModelName(model.name)}
              </Text>
              <Text className="font-semibold opacity-45">|</Text>
              <Text numberOfLines={1} ellipsizeMode="tail" className="min-w-0 flex-1 font-semibold opacity-45">
                {providerDisplayName}
              </Text>
            </>
          ) : (
            <Text numberOfLines={1} className="flex-1">
              {t('settings.models.empty.label')}
            </Text>
          )}
        </XStack>
      </Button.Label>
      <ChevronDown size={18} className="text-foreground-secondary opacity-90" />
    </Button>
  )
}

interface AssistantSettingItemProps {
  assistantId: string
  titleKey: string
  descriptionKey: string
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
  icon?: React.ReactElement
}

function AssistantSettingItem({
  assistantId,
  titleKey,
  descriptionKey,
  assistant,
  updateAssistant,
  icon
}: AssistantSettingItemProps) {
  const { t } = useTranslation()
  const navigation = useNavigation<StackNavigationProp<AssistantSettingsStackParamList>>()

  const handleModelChange = async (models: Model[]) => {
    const newModel = models[0]
    await updateAssistant({ ...assistant, model: newModel, defaultModel: newModel })
  }

  const handlePress = () => {
    presentModelSheet({
      mentions: assistant.defaultModel ? [assistant.defaultModel] : [],
      setMentions: handleModelChange,
      multiple: false
    })
  }

  return (
    <>
      <YStack className="gap-2">
        <XStack className="items-center justify-between px-2.5">
          <XStack className="items-center gap-2">
            {icon}
            <Text className="text-foreground-secondary font-semibold">{t(titleKey)}</Text>
          </XStack>
          <IconButton
            icon={<Settings2 size={16} className="text-blue-500" />}
            onPress={() => navigation.navigate('AssistantDetailScreen', { assistantId })}
          />
        </XStack>
        <ModelPicker assistant={assistant} onPress={handlePress} />
        <Text className="text-foreground-secondary px-2.5 opacity-70">{t(descriptionKey)}</Text>
      </YStack>
    </>
  )
}

export default function AssistantSettingsScreen() {
  const { t } = useTranslation()

  const { assistant: defaultAssistant, updateAssistant: updateDefaultAssistant } = useAssistant('default')
  const { assistant: quickAssistant, updateAssistant: updateQuickAssistant } = useAssistant('quick')
  const { assistant: translateAssistant, updateAssistant: updateTranslateAssistant } = useAssistant('translate')

  const isLoading = !defaultAssistant || !quickAssistant || !translateAssistant

  if (isLoading) {
    return (
      <SafeAreaContainer className="items-center justify-center">
        <ActivityIndicator />
      </SafeAreaContainer>
    )
  }

  const assistantItems = [
    {
      id: 'default',
      titleKey: 'settings.assistant.default_assistant.name',
      descriptionKey: 'settings.assistant.default_assistant.description',
      assistant: defaultAssistant,
      updateAssistant: updateDefaultAssistant,
      icon: <MessageSquareMore size={16} className="text-foreground-secondary" />
    },
    {
      id: 'quick',
      titleKey: 'settings.assistant.quick_assistant.name',
      descriptionKey: 'settings.assistant.quick_assistant.description',
      assistant: quickAssistant,
      updateAssistant: updateQuickAssistant,
      icon: <Rocket size={16} className="text-foreground-secondary" />
    },
    {
      id: 'translate',
      titleKey: 'settings.assistant.translate_assistant.name',
      descriptionKey: 'settings.assistant.translate_assistant.description',
      assistant: translateAssistant,
      updateAssistant: updateTranslateAssistant,
      icon: <Languages size={16} className="text-foreground-secondary" />
    }
  ]

  return (
    <SafeAreaContainer>
      <HeaderBar title={t('settings.assistant.title')} />
      <Container>
        {assistantItems.map(item => (
          <AssistantSettingItem
            key={item.id}
            assistantId={item.id}
            titleKey={item.titleKey}
            descriptionKey={item.descriptionKey}
            assistant={item.assistant}
            updateAssistant={item.updateAssistant}
            icon={item.icon}
          />
        ))}
      </Container>
    </SafeAreaContainer>
  )
}
