import { BottomSheetModal } from '@gorhom/bottom-sheet'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import { ChevronDown, Languages, MessageSquareMore, Rocket, Settings2 } from '@/componentsV2/icons/LucideIcon'
import React, { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'
import { Button, useTheme } from 'heroui-native'

import { Container, HeaderBar, Image, SafeAreaContainer, Text, XStack, YStack, IconButton } from '@/componentsV2'
import { useAssistant } from '@/hooks/useAssistant'
import { AssistantSettingsStackParamList } from '@/navigators/settings/AssistantSettingsStackNavigator'
import { Assistant, Model } from '@/types/assistant'
import { getModelOrProviderIcon } from '@/utils/icons'
import { getBaseModelName } from '@/utils/naming'
import ModelSheet from '@/componentsV2/features/Sheet/ModelSheet'

function ModelPicker({ assistant, onPress }: { assistant: Assistant; onPress: () => void }) {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const model = assistant?.defaultModel

  return (
    <Button
      variant="ghost"
      className="w-full   justify-between bg-ui-card-background px-3  dark:bg-ui-card-background-dark"
      onPress={onPress}>
      <Button.Label>
        <XStack className="flex-1 items-center gap-2 overflow-hidden">
          {model ? (
            <>
              <Image
                className="h-[18px] w-[18px] rounded-full"
                source={getModelOrProviderIcon(model.id, model.provider, isDark)}
              />
              <Text numberOfLines={1} className="max-w-[60%] shrink-0 font-medium">
                {getBaseModelName(model.name)}
              </Text>
              <Text className="font-semibold opacity-45">|</Text>
              <Text numberOfLines={1} className="shrink font-semibold opacity-45">
                {t(`provider.${model.provider}`)}
              </Text>
            </>
          ) : (
            <Text numberOfLines={1} className="flex-1">
              {t('settings.models.empty.label')}
            </Text>
          )}
        </XStack>
      </Button.Label>
      <ChevronDown size={18} className="text-text-secondary opacity-90 dark:text-text-secondary-dark" />
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
  const sheetRef = useRef<BottomSheetModal>(null)

  const handleModelChange = async (models: Model[]) => {
    const newModel = models[0]
    await updateAssistant({ ...assistant, model: newModel, defaultModel: newModel })
  }

  return (
    <>
      <YStack className="gap-2">
        <XStack className="items-center justify-between px-[10px]">
          <XStack className="items-center gap-2">
            {icon}
            <Text className="font-semibold text-text-secondary dark:text-text-secondary-dark">{t(titleKey)}</Text>
          </XStack>
          <IconButton
            icon={<Settings2 size={16} className="text-text-link" />}
            onPress={() => navigation.navigate('AssistantDetailScreen', { assistantId })}
          />
        </XStack>
        <ModelPicker assistant={assistant} onPress={() => sheetRef.current?.present()} />
        <Text className="px-[10px] text-text-secondary opacity-70 dark:text-text-secondary-dark">
          {t(descriptionKey)}
        </Text>
      </YStack>

      <ModelSheet
        ref={sheetRef}
        mentions={assistant.defaultModel ? [assistant.defaultModel] : []}
        setMentions={handleModelChange}
        multiple={false}
      />
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
      icon: <MessageSquareMore size={16} className="text-text-secondary dark:text-text-secondary-dark" />
    },
    {
      id: 'quick',
      titleKey: 'settings.assistant.quick_assistant.name',
      descriptionKey: 'settings.assistant.quick_assistant.description',
      assistant: quickAssistant,
      updateAssistant: updateQuickAssistant,
      icon: <Rocket size={16} className="text-text-secondary dark:text-text-secondary-dark" />
    },
    {
      id: 'translate',
      titleKey: 'settings.assistant.translate_assistant.name',
      descriptionKey: 'settings.assistant.translate_assistant.description',
      assistant: translateAssistant,
      updateAssistant: updateTranslateAssistant,
      icon: <Languages size={16} className="text-text-secondary dark:text-text-secondary-dark" />
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
