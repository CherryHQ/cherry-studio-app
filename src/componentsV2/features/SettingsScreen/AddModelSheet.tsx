import { BottomSheetBackdrop, BottomSheetModal, BottomSheetTextInput, BottomSheetView } from '@gorhom/bottom-sheet'
import { Button } from 'heroui-native'
import React, { forwardRef, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Keyboard, TouchableWithoutFeedback, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import Text from '@/componentsV2/base/Text'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useTheme } from '@/hooks/useTheme'
import { loggerService } from '@/services/LoggerService'
import type { Model, Provider } from '@/types/assistant'
import { getDefaultGroupName } from '@/utils/naming'

const logger = loggerService.withContext('AddModelSheet')

// Stable handler to prevent re-renders
const stopPropagation = () => true

interface AddModelSheetProps {
  provider?: Provider
  updateProvider: (updates: Partial<Omit<Provider, 'id'>>) => Promise<void>
}

export const AddModelSheet = forwardRef<BottomSheetModal, AddModelSheetProps>(({ provider, updateProvider }, ref) => {
  const { t } = useTranslation()
  const { isDark } = useTheme()

  const [modelId, setModelId] = useState('')
  const [modelName, setModelName] = useState('')
  const [modelGroup, setModelGroup] = useState('')
  const [isVisible, setIsVisible] = useState(false)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    setModelName(modelId)
    setModelGroup(getDefaultGroupName(modelId, provider?.id))
  }, [modelId, provider?.id])

  useEffect(() => {
    if (!isVisible) return

    const backAction = () => {
      ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [ref, isVisible])

  const handleAddModel = async () => {
    if (!provider || !modelId.trim()) {
      logger.warn('Provider not available or Model ID is required.')
      return
    }

    if (provider.models.some(model => model.id === modelId.trim())) {
      logger.warn('Model ID already exists.', { modelId: modelId.trim() })
      return
    }

    const newModel: Model = {
      id: modelId,
      provider: provider.id,
      name: modelName,
      group: modelGroup
    }

    try {
      await updateProvider({ models: [...provider.models, newModel] })
      logger.info('Successfully added model:', newModel)
      ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
    } catch (error) {
      logger.error('Failed to add model:', error)
    } finally {
      setModelId('')
      setModelName('')
      setModelGroup('')
    }
  }

  const renderBackdrop = (props: any) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />
  )

  const inputStyle = useMemo(
    () => ({
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 16,
      backgroundColor: isDark ? '#19191C' : '#ffffffff',
      borderWidth: 0.5,
      borderColor: '#a0a1b066',
      color: isDark ? '#f9f9f9ff' : '#202020ff'
    }),
    [isDark]
  )

  return (
    <BottomSheetModal
      enableDynamicSizing={true}
      ref={ref}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backgroundStyle={{
        borderRadius: 30,
        backgroundColor: isDark ? '#121213ff' : '#f7f7f7ff'
      }}
      handleIndicatorStyle={{
        backgroundColor: isDark ? '#f9f9f9ff' : '#202020ff'
      }}
      backdropComponent={renderBackdrop}
      onDismiss={() => setIsVisible(false)}
      onChange={index => setIsVisible(index >= 0)}>
      <BottomSheetView style={{ paddingBottom: insets.bottom }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <YStack className="items-center gap-2.5 px-5 pb-7">
            <XStack className="w-full items-center justify-center">
              <Text className="text-xl">{t('settings.models.add.model.label')}</Text>
            </XStack>
            <YStack className="w-full items-center justify-center gap-6">
              {/* Model ID Input */}
              <YStack className="w-full gap-2">
                <XStack className="gap-2 px-3">
                  <Text className="text-text-secondary">{t('settings.models.add.model.id.label')}</Text>
                  <Text className="text-red-500">*</Text>
                </XStack>
                <View onStartShouldSetResponder={stopPropagation}>
                  <BottomSheetTextInput
                    style={inputStyle}
                    placeholder={t('settings.models.add.model.id.placeholder')}
                    value={modelId}
                    onChangeText={setModelId}
                  />
                </View>
              </YStack>
              {/* Model Name Input */}
              <YStack className="w-full gap-2">
                <XStack className="gap-2 px-3">
                  <Text className="text-text-secondary">{t('settings.models.add.model.name.label')}</Text>
                </XStack>
                <View onStartShouldSetResponder={stopPropagation}>
                  <BottomSheetTextInput
                    style={inputStyle}
                    placeholder={t('settings.models.add.model.name.placeholder')}
                    value={modelName}
                    onChangeText={setModelName}
                  />
                </View>
              </YStack>
              {/* Model Group Input */}
              <YStack className="w-full gap-2">
                <XStack className="gap-2 px-3">
                  <Text className="text-text-secondary">{t('settings.models.add.model.group.label')}</Text>
                </XStack>
                <View onStartShouldSetResponder={stopPropagation}>
                  <BottomSheetTextInput
                    style={inputStyle}
                    placeholder={t('settings.models.add.model.group.placeholder')}
                    value={modelGroup}
                    onChangeText={setModelGroup}
                  />
                </View>
              </YStack>
              <Button
                variant="tertiary"
                className="border-green-20 bg-green-10 h-11 w-4/6 rounded-2xl"
                onPress={handleAddModel}
                isDisabled={!modelId.trim()}>
                <Button.Label>
                  <Text className="text-green-100">{t('settings.models.add.model.label')}</Text>
                </Button.Label>
              </Button>
            </YStack>
          </YStack>
        </TouchableWithoutFeedback>
      </BottomSheetView>
    </BottomSheetModal>
  )
})
AddModelSheet.displayName = 'AddModelSheet'
