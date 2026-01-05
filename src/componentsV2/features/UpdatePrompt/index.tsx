import { BlurView } from 'expo-blur'
import { Button, Dialog, Spinner } from 'heroui-native'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'

import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useUpdateCheck } from '@/hooks/useUpdateCheck'

export function UpdatePrompt() {
  const { t } = useTranslation()
  const { shouldShow, isUpdating, downloadAndApply, ignoreCurrentVersion } = useUpdateCheck()

  return (
    <Dialog isOpen={shouldShow} onOpenChange={open => !open && ignoreCurrentVersion()}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-transparent" isCloseOnPress={!isUpdating}>
          <BlurView
            className="absolute inset-0"
            intensity={30}
            experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : 'none'}
          />
        </Dialog.Overlay>
        <Dialog.Content>
          <YStack className="gap-2">
            <Dialog.Title className="text-xl">{t('update.title')}</Dialog.Title>
            <Dialog.Description className="text-zinc-400">{t('update.description')}</Dialog.Description>
          </YStack>
          <XStack className="mt-4 justify-end gap-2">
            <Button variant="ghost" className="h-8 rounded-xl" onPress={ignoreCurrentVersion} isDisabled={isUpdating}>
              <Button.Label className="text-zinc-400">{t('update.ignore')}</Button.Label>
            </Button>
            <Button
              variant="ghost"
              className="border-primary/30 bg-primary/15 h-8 items-center justify-center rounded-xl border"
              onPress={downloadAndApply}
              isIconOnly={isUpdating}>
              {isUpdating ? (
                <Spinner className="primary-text" size="sm" />
              ) : (
                <Button.Label className="primary-text">{t('update.now')}</Button.Label>
              )}
            </Button>
          </XStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  )
}
