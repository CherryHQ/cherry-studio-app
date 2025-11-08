import React from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { Text, XStack } from '@/componentsV2'
import { ModelIcon } from '@/componentsV2/icons'
import { useProvider } from '@/hooks/useProviders'
import type { Message } from '@/types/message'
import { storage } from '@/utils'
import { getBaseModelName } from '@/utils/naming'

interface MessageHeaderProps {
  message: Message
}

const MessageHeader: React.FC<MessageHeaderProps> = ({ message }) => {
  const providerId = message.model?.provider ?? ''
  const { provider } = useProvider(providerId)
  const { t } = useTranslation()
  const currentLanguage = storage.getString('language')
  const providerDisplayName = providerId
    ? t(`provider.${providerId}`, { defaultValue: provider?.name ?? providerId })
    : (provider?.name ?? providerId)

  return (
    <View>
      {message.model && (
        <XStack className="items-center gap-2">
          <ModelIcon model={message.model} />
          <Text className="max-w-[40%] text-base" ellipsizeMode="middle" numberOfLines={1}>
            {getBaseModelName(message.model?.name)}
          </Text>
          <Text>|</Text>
          <Text className="text-text-secondary text-base">{providerDisplayName}</Text>
          <Text className="text-text-secondary text-xs">
            {new Date(message.createdAt).toLocaleTimeString(currentLanguage, {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            })}
          </Text>
        </XStack>
      )}
    </View>
  )
}

export default React.memo(MessageHeader)
