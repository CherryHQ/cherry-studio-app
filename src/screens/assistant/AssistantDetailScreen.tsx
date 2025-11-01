import type { RouteProp } from '@react-navigation/native'
import { useNavigation, useRoute } from '@react-navigation/native'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'
import { GestureDetector } from 'react-native-gesture-handler'

import {
  AvatarEditButton,
  Container,
  DrawerGestureWrapper,
  HeaderBar,
  SafeAreaContainer,
  Text,
  XStack
} from '@/componentsV2'
import { DefaultProviderIcon } from '@/componentsV2/icons'
import { ArrowLeftRight, PenLine } from '@/componentsV2/icons/LucideIcon'
import { useAssistant } from '@/hooks/useAssistant'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'
import AssistantDetailTabNavigator from '@/navigators/AssistantDetailTabNavigator'
import type { AssistantStackParamList } from '@/navigators/AssistantStackNavigator'
import { loggerService } from '@/services/LoggerService'
import type { DrawerNavigationProps } from '@/types/naviagate'
const logger = loggerService.withContext('AssistantDetailScreen')

type AssistantDetailRouteProp = RouteProp<AssistantStackParamList, 'AssistantDetailScreen'>

export default function AssistantDetailScreen() {
  const { t } = useTranslation()

  const route = useRoute<AssistantDetailRouteProp>()
  const navigation = useNavigation<DrawerNavigationProps>()
  const { assistantId } = route.params
  const { assistant, isLoading, updateAssistant } = useAssistant(assistantId)
  const panGesture = useSwipeGesture()

  const updateAvatar = async (avatar: string) => {
    if (!assistant) return

    try {
      await updateAssistant({ ...assistant, emoji: avatar })
    } catch (error) {
      logger.error('Failed to update avatar', error)
    }
  }

  if (isLoading) {
    return (
      <SafeAreaContainer className="items-center justify-center">
        <DrawerGestureWrapper>
          <View collapsable={false} className="flex-1 items-center justify-center">
            <ActivityIndicator />
          </View>
        </DrawerGestureWrapper>
      </SafeAreaContainer>
    )
  }

  if (!assistant) {
    return (
      <SafeAreaContainer className="flex-1 items-center justify-center">
        <DrawerGestureWrapper>
          <View collapsable={false} className="flex-1 items-center justify-center">
            <Text>{t('assistants.error.notFound')}</Text>
          </View>
        </DrawerGestureWrapper>
      </SafeAreaContainer>
    )
  }

  return (
    <SafeAreaContainer>
      <GestureDetector gesture={panGesture}>
        <View collapsable={false} className="flex-1">
          <HeaderBar
            title={!assistant?.emoji ? t('assistants.title.create') : t('assistants.title.edit')}
            onBackPress={() => navigation.goBack()}
          />
          <View className="flex-1">
            <Container>
              <XStack className="items-center justify-center pb-5">
                <AvatarEditButton
                  content={assistant?.emoji || <DefaultProviderIcon />}
                  editIcon={assistant?.emoji ? <ArrowLeftRight size={24} /> : <PenLine size={24} />}
                  onEditPress={() => {}}
                  updateAvatar={updateAvatar}
                />
              </XStack>

              {/* Material Top Tabs Navigator */}
              <View className="flex-1">
                <AssistantDetailTabNavigator assistant={assistant} />
              </View>
            </Container>
          </View>
        </View>
      </GestureDetector>
    </SafeAreaContainer>
  )
}
