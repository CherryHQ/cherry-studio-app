import { BlurView } from 'expo-blur'
import { Button, Dialog, Spinner } from 'heroui-native'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'

import XStack from '@/componentsV2/layout/XStack'

import { DIALOG_COLORS, type DialogState } from './types'

interface UnifiedDialogProps extends DialogState {
  onOpenChange: (open: boolean) => void
  onConfirmPress: () => void
  onCancelPress: () => void
}

export function UnifiedDialog({
  type,
  isOpen,
  isLoading,
  title,
  content,
  confirmText,
  showCancel,
  cancelText,
  onOpenChange,
  onConfirmPress,
  onCancelPress
}: UnifiedDialogProps) {
  const { t } = useTranslation()
  const colors = DIALOG_COLORS[type]
  const dialogContent =
    typeof content === 'string' ? <Dialog.Description className="text-zinc-300">{content}</Dialog.Description> : content

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-transparent" isCloseOnPress={!isLoading}>
          <BlurView
            className="absolute inset-0"
            intensity={30}
            experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : 'none'}
          />
        </Dialog.Overlay>
        <Dialog.Content>
          <Dialog.Title className="text-xl">{title}</Dialog.Title>
          {dialogContent}
          <XStack className="mt-4 justify-end gap-2">
            {showCancel && (
              <Button variant="ghost" className="h-8 rounded-xl" onPress={onCancelPress} isDisabled={isLoading}>
                <Button.Label className="text-zinc-400">{cancelText ?? t('common.cancel')}</Button.Label>
              </Button>
            )}
            <Button
              variant="ghost"
              className={`h-8 items-center justify-center rounded-xl border ${colors.border} ${colors.bg}`}
              onPress={onConfirmPress}
              isIconOnly={isLoading}>
              {isLoading ? (
                <Spinner className={colors.spinner} size="sm" />
              ) : (
                <Button.Label className={colors.text}>{confirmText ?? t('common.confirm')}</Button.Label>
              )}
            </Button>
          </XStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  )
}
