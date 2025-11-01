import Constants from 'expo-constants'
import * as ExpoLinking from 'expo-linking'
import React from 'react'
import { useTranslation } from 'react-i18next'

import {
  Container,
  Group,
  HeaderBar,
  Image,
  PressableRow,
  Row,
  SafeAreaContainer,
  Text,
  XStack,
  YStack
} from '@/componentsV2'
import { ArrowUpRight, Copyright, Github, Globe, Mail, Rss } from '@/componentsV2/icons/LucideIcon'
import { loggerService } from '@/services/LoggerService'
const logger = loggerService.withContext('AboutScreen')

export default function AboutScreen() {
  const { t } = useTranslation()
  const appVersion = Constants.expoConfig?.version || 'latest'

  const openLink = async (url: string) => {
    try {
      await ExpoLinking.openURL(url)
    } catch (error) {
      logger.error('Failed to open link:', error)
    }
  }

  return (
    <SafeAreaContainer style={{ flex: 1 }}>
      <HeaderBar
        title={t('settings.about.header')}
        rightButton={{
          icon: <Github size={24} />,
          onPress: async () => await openLink('https://github.com/CherryHQ/cherry-studio-app')
        }}
      />
      <Container>
        <YStack className="flex-1 gap-6">
          {/* Logo and Description */}
          <Group>
            <Row className="gap-4">
              <Image className="h-[70px] w-[70px] rounded-[41px]" source={require('@/assets/images/favicon.png')} />
              <YStack className="flex-1 gap-[5px] py-1">
                <Text className="text-[22px] font-bold">{t('common.cherry_studio')}</Text>
                <Text className="text-sm text-text-secondary dark:text-text-secondary-dark" numberOfLines={0}>
                  {t('common.cherry_studio_description')}
                </Text>
                <Text className="self-start rounded-[25.37px] border border-green-20 bg-green-10 px-2 py-0.5 text-sm text-green-100 dark:border-green-dark-20 dark:bg-green-dark-10 dark:text-green-dark-100">
                  v{appVersion}
                </Text>
              </YStack>
            </Row>
          </Group>

          <Group>
            <PressableRow
              onPress={async () => await openLink('https://github.com/CherryHQ/cherry-studio-app/releases/')}>
              <XStack className="items-center gap-[10px]">
                <Rss size={20} />
                <Text>{t('settings.about.releases.title')}</Text>
              </XStack>
              <ArrowUpRight size={16} />
            </PressableRow>
            <PressableRow onPress={async () => await openLink('https://www.cherry-ai.com/')}>
              <XStack className="items-center gap-3">
                <Globe size={20} />
                <Text>{t('settings.about.website.title')}</Text>
              </XStack>
              <ArrowUpRight size={16} />
            </PressableRow>
            <PressableRow onPress={async () => await openLink('https://github.com/CherryHQ/cherry-studio-app/issues/')}>
              <XStack className="items-center gap-3">
                <Github size={20} />
                <Text>{t('settings.about.feedback.title')}</Text>
              </XStack>
              <ArrowUpRight size={16} />
            </PressableRow>
            <PressableRow
              onPress={async () => await openLink('https://github.com/CherryHQ/cherry-studio/blob/main/LICENSE/')}>
              <XStack className="items-center gap-3">
                <Copyright size={20} />
                <Text>{t('settings.about.license.title')}</Text>
              </XStack>
              <ArrowUpRight size={16} />
            </PressableRow>
            <PressableRow onPress={async () => await openLink('https://docs.cherry-ai.com/contact-us/questions/')}>
              <XStack className="items-center gap-3">
                <Mail size={20} />
                <Text>{t('settings.about.contact.title')}</Text>
              </XStack>
              <ArrowUpRight size={16} />
            </PressableRow>
          </Group>
        </YStack>
      </Container>
    </SafeAreaContainer>
  )
}
