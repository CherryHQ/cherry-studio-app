import BottomSheet from '@gorhom/bottom-sheet'
import { ChevronsRight } from '@tamagui/lucide-icons'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'
import { Button, Text, useTheme, XStack, YStack } from 'tamagui'

import { ISheet } from '@/components/ui/Sheet'

interface ApiCheckSheetProps {
  bottomSheetRef: React.RefObject<BottomSheet | null>
  isOpen: boolean
  onClose: () => void
  apiKey: string
  onStartModelCheck: () => void
  loading?: boolean
}

export function ApiCheckSheet({
  bottomSheetRef,
  isOpen,
  onClose,
  apiKey,
  onStartModelCheck,
  loading = false
}: ApiCheckSheetProps) {
  const { t } = useTranslation()
  const theme = useTheme()
  const sheetSnapPoints = ['40%']
  const indicatorColor = theme.background.val.includes('dark') ? 'white' : 'black'

  return (
    <ISheet bottomSheetRef={bottomSheetRef} isOpen={isOpen} onClose={onClose} snapPoints={sheetSnapPoints}>
      <YStack alignItems="center" paddingTop={10} paddingBottom={30} paddingHorizontal={20} gap={10}>
        <XStack width="100%" alignItems="center" justifyContent="center">
          <Text fontSize={24}>{t('settings.provider.api_check.title')}</Text>
        </XStack>
        <XStack width="100%" alignItems="center" justifyContent="center">
          <Button
            height={60}
            width={224}
            borderRadius={70}
            backgroundColor="$color1"
            disabled={!apiKey || loading}
            onPress={onStartModelCheck}>
            {loading ? (
              <ActivityIndicator color={indicatorColor} />
            ) : (
              <XStack width="100%" alignItems="center" justifyContent="space-between">
                <Text fontSize={18} fontWeight="bold">
                  {t('button.start_check_model')}
                </Text>
                <ChevronsRight />
              </XStack>
            )}
          </Button>
        </XStack>
      </YStack>
    </ISheet>
  )
}
