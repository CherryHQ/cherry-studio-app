import * as ExpoLinking from 'expo-linking'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, OpaqueColorValue } from 'react-native'
import { Button, GetThemeValueForKey, Text } from 'tamagui'

interface ExternalLinkProps {
  href: string
  children: React.ReactNode
  color?: 'unset' | GetThemeValueForKey<'color'> | OpaqueColorValue
  size?: number
  onError?: (error: Error) => void
}

const ExternalLink: React.FC<ExternalLinkProps> = ({ href, children, color = '$blue10', size, onError }) => {
  const { t } = useTranslation()

  const handlePress = async () => {
    const supported = await ExpoLinking.canOpenURL(href)

    if (supported) {
      try {
        await ExpoLinking.openURL(href)
      } catch (error) {
        const message = t('errors.cannotOpenLink', {
          error: error instanceof Error ? error.message : String(error)
        })
        console.error(message, error)

        if (onError) {
          onError(error instanceof Error ? error : new Error(String(error)))
        } else {
          Alert.alert(t('errors.linkErrorTitle'), message)
        }
      }
    } else {
      const message = t('errors.deviceCannotHandleLink', { href })
      console.warn(message)

      if (onError) {
        onError(new Error(message))
      } else {
        Alert.alert(t('errors.cannotOpenLinkTitle'), message)
      }
    }
  }

  const content =
    typeof children === 'string' ? (
      <Text alignItems="center" justifyContent="center" color={color} fontSize={size}>
        {children}
      </Text>
    ) : (
      children
    )

  return (
    <Button
      size={size ? size + 5 : undefined}
      alignItems="center"
      justifyContent="center"
      backgroundColor="$colorTransparent"
      onPress={handlePress}>
      {content}
    </Button>
  )
}

export default ExternalLink
