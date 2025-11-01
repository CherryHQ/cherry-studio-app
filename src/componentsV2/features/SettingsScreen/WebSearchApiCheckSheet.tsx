import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet'
import { Button, Spinner, useTheme } from 'heroui-native'
import React, { forwardRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, View } from 'react-native'

import Text from '@/componentsV2/base/Text'
import { ChevronsRight } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import type { ApiStatus } from '@/types/assistant'

interface WebSearchApiCheckSheetProps {
  onStartModelCheck: () => void
  checkApiStatus: ApiStatus
}

const renderBackdrop = (props: any) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />
)

export const WebSearchApiCheckSheet = forwardRef<BottomSheetModal, WebSearchApiCheckSheetProps>(
  ({ onStartModelCheck, checkApiStatus }, ref) => {
    const { t } = useTranslation()
    const { isDark } = useTheme()
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
      if (!isVisible) return

      const backAction = () => {
        ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
        return true
      }

      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
      return () => backHandler.remove()
    }, [ref, isVisible])

    return (
      <BottomSheetModal
        backdropComponent={renderBackdrop}
        enableDynamicSizing={true}
        ref={ref}
        backgroundStyle={{
          borderRadius: 30,
          backgroundColor: isDark ? '#121213ff' : '#f7f7f7ff'
        }}
        handleIndicatorStyle={{
          backgroundColor: isDark ? '#f9f9f9ff' : '#202020ff'
        }}
        onDismiss={() => setIsVisible(false)}
        onChange={index => setIsVisible(index >= 0)}>
        <BottomSheetView>
          <YStack className="items-center gap-2.5 px-5 pb-7 pt-2.5">
            <XStack className="w-full items-center justify-center">
              <Text className="text-2xl text-text-primary dark:text-text-primary-dark">
                {t('settings.provider.api_check.title')}
              </Text>
            </XStack>
            <XStack className="w-full items-center justify-center">
              <Button
                variant="tertiary"
                className="h-11 w-1/2 rounded-lg border-green-20 bg-green-10 dark:border-green-dark-20 dark:bg-green-dark-10"
                isDisabled={checkApiStatus === 'processing'}
                onPress={onStartModelCheck}>
                <Button.Label>
                  {checkApiStatus === 'processing' && (
                    <View>
                      <XStack className="w-full items-center justify-center gap-2.5">
                        <Spinner size="sm" color="success" />
                        <Text className="text-lg font-bold text-green-100 dark:text-green-dark-100">
                          {t('button.checking')}
                        </Text>
                      </XStack>
                    </View>
                  )}

                  {checkApiStatus === 'idle' && (
                    <View>
                      <XStack className="w-full items-center justify-between">
                        <Text className="text-lg font-bold text-green-100 dark:text-green-dark-100">
                          {t('button.start_check_model')}
                        </Text>
                        <ChevronsRight className="text-green-100 dark:text-green-dark-100" />
                      </XStack>
                    </View>
                  )}

                  {checkApiStatus === 'success' && (
                    <View>
                      <XStack className="w-full items-center justify-center">
                        <Text className="text-lg font-bold text-green-100 dark:text-green-dark-100">
                          {t('button.success')}
                        </Text>
                      </XStack>
                    </View>
                  )}
                </Button.Label>
              </Button>
            </XStack>
          </YStack>
        </BottomSheetView>
      </BottomSheetModal>
    )
  }
)

WebSearchApiCheckSheet.displayName = 'WebSearchApiCheckSheet'
