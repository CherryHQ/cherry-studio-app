import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { ArrowLeftRight, PenLine } from '@tamagui/lucide-icons'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { styled, Tabs, Text, useTheme, View, XStack, YStack } from 'tamagui'

import { ModelTabContent } from '@/components/assistant/ModelTabContent'
import { PromptTabContent } from '@/components/assistant/PromptTabContent'
import { ToolTabContent } from '@/components/assistant/ToolTabContent'
import { DefaultProviderIcon } from '@/components/icons/DefaultProviderIcon'
import { SettingContainer } from '@/components/settings'
import { HeaderBar } from '@/components/settings/HeaderBar'
import { AvatarEditButton } from '@/components/ui/AvatarEditButton'
import SafeAreaContainer from '@/components/ui/SafeAreaContainer'
import { useAssistant } from '@/hooks/useAssistant'
import { RootStackParamList } from '@/types/naviagate'

type AssistantDetailRouteProp = RouteProp<RootStackParamList, 'AssistantDetailScreen'>

export default function AssistantDetailScreen() {
  const { t } = useTranslation()
  const theme = useTheme()
  const navigation = useNavigation()
  const route = useRoute<AssistantDetailRouteProp>()

  const { assistantId } = route.params
  const [activeTab, setActiveTab] = useState('model')
  const { assistant, isLoading, updateAssistant } = useAssistant(assistantId)

  if (isLoading) {
    return (
      <SafeAreaContainer>
        <ActivityIndicator />
      </SafeAreaContainer>
    )
  }

  if (!assistant) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>{t('assistants.error.notFound')}</Text>
      </View>
    )
  }

  return (
    <SafeAreaContainer>
      <HeaderBar
        title={!assistant?.emoji ? t('assistants.title.create') : t('assistants.title.edit')}
        onBackPress={() => navigation.goBack()}
      />
      <KeyboardAwareScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1 }}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled">
        <SettingContainer>
          <XStack justifyContent="center" alignItems="center">
            <AvatarEditButton
              content={assistant?.emoji || <DefaultProviderIcon />}
              editIcon={assistant?.emoji ? <ArrowLeftRight size={24} /> : <PenLine size={24} />}
              onEditPress={() => {
                // 处理编辑逻辑
                console.log('Edit avatar')
              }}
              onAvatarPress={() => {
                // 处理头像点击逻辑（可选）
                console.log('Avatar pressed')
              }}
            />
          </XStack>
          {/* todo: change active tabs style */}
          <Tabs value={activeTab} onValueChange={setActiveTab} orientation="horizontal" flexDirection="column" flex={1}>
            <Tabs.List
              backgroundColor="$background"
              borderRadius="20"
              gap={5}
              paddingVertical={4}
              paddingHorizontal={5}>
              <StyledTab value="prompt">
                <Text fontSize="12">{t('common.prompt')}</Text>
              </StyledTab>
              <StyledTab value="model">
                <Text fontSize="12">{t('common.model')}</Text>
              </StyledTab>
              <StyledTab value="tool">
                <Text fontSize="12">{t('common.tool')}</Text>
              </StyledTab>
            </Tabs.List>
            <YStack flex={1} paddingTop={30}>
              <Tabs.Content value="prompt" flex={1} gap={30}>
                <PromptTabContent assistant={assistant} updateAssistant={updateAssistant} />
              </Tabs.Content>

              <Tabs.Content value="model" flex={1} gap={30}>
                <ModelTabContent assistant={assistant} updateAssistant={updateAssistant} />
              </Tabs.Content>

              <Tabs.Content value="tool" flex={1} gap={30}>
                <ToolTabContent assistant={assistant} updateAssistant={updateAssistant} />
              </Tabs.Content>
            </YStack>
          </Tabs>
        </SettingContainer>
      </KeyboardAwareScrollView>
    </SafeAreaContainer>
  )
}

const StyledTab = styled(Tabs.Tab, {
  flex: 1,
  backgroundColor: '$background',
  borderRadius: 20,
  paddingVertical: 8,
  paddingHorizontal: 20
})
