import { Button, cn } from 'heroui-native'
import { MotiView } from 'moti'
import React, { createContext, useContext, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Pressable } from 'react-native'

import Text from '@/componentsV2/base/Text'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useTheme } from '@/hooks/useTheme'

export type DialogOptions = {
  title?: React.ReactNode | string
  content?: React.ReactNode | string
  confirmText?: string
  cancelText?: string
  confirmStyle?: string
  cancelStyle?: string
  showCancel?: boolean
  /** 是否可以点击遮罩层关闭 */
  maskClosable?: boolean
  type?: 'info' | 'warning' | 'error' | 'success'
  onConFirm?: () => void | Promise<void>
  onCancel?: () => void | Promise<void>
  showLoading?: boolean
}

type DialogContextValue = { open: (options: DialogOptions) => void; close: () => void } | undefined

const DialogContext = createContext<DialogContextValue>(undefined)

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const { isDark } = useTheme()
  const [isOpen, setOpen] = useState(false)
  const [options, setOptions] = useState<DialogOptions | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const { t } = useTranslation()

  const centeredViewClassName = isDark
    ? 'flex-1 justify-center items-center bg-black/70'
    : 'flex-1 justify-center items-center bg-black/40'

  const close = () => {
    setOpen(false)
    setTimeout(() => {
      setOptions(null)
    }, 300)
  }

  const cancel = async () => {
    if (isLoading) return

    try {
      await options?.onCancel?.()
    } catch (error) {
      console.error('Dialog onCancel error:', error)
    }
    close()
  }

  const confirm = async () => {
    if (isLoading) return

    if (options?.showLoading) {
      setIsLoading(true)
    }

    try {
      await options?.onConFirm?.()
    } catch (error) {
      console.error('Dialog onConFirm error:', error)
    } finally {
      setIsLoading(false)
      close()
    }
  }

  const open = (newOptions: DialogOptions) => {
    setOptions(newOptions)
    setIsLoading(false)
    setOpen(true)
  }

  const getConfirmButtonClassName = () => {
    switch (options?.type) {
      case 'info':
        return 'bg-blue-20 border-blue-20'
      case 'warning':
        return 'bg-orange-20 border-orange-20'
      case 'error':
        return 'bg-red-20 border-red-20'
      case 'success':
        return 'bg-green-10 border-green-20'
      default:
        return 'bg-green-10 border-green-20'
    }
  }

  const getConfirmTextClassName = () => {
    switch (options?.type) {
      case 'info':
        return 'text-blue-100'
      case 'warning':
        return 'text-orange-100'
      case 'error':
        return 'text-red-100'
      case 'success':
        return 'text-green-100'
      default:
        return 'text-green-100'
    }
  }

  const api = { open, close }

  const showCancel = options?.showCancel ?? true
  const maskClosable = options?.maskClosable ?? true
  const confirmText = options?.confirmText ?? t('common.ok')
  const cancelText = options?.cancelText ?? t('common.cancel')
  const shouldShowLoading = options?.showLoading ?? false

  const confirmButtonClassName = getConfirmButtonClassName()
  const confirmTextClassName = getConfirmTextClassName()

  return (
    <DialogContext.Provider value={api}>
      {children}
      <Modal animationType="fade" transparent visible={isOpen} onRequestClose={cancel}>
        <MotiView
          from={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: 'timing', duration: 300 }}
          className={centeredViewClassName}>
          {maskClosable && <Pressable className="absolute inset-0" onPress={cancel} />}
          <YStack className="bg-ui-card-background w-3/4 rounded-2xl">
            <YStack className="items-center gap-3 p-5">
              {typeof options?.title === 'string' ? (
                <Text className="text-text-primary text-lg font-bold">{options.title}</Text>
              ) : (
                options?.title
              )}
              {typeof options?.content === 'string' ? (
                <Text className="text-text-secondary text-center text-[15px] leading-5">{options.content}</Text>
              ) : (
                options?.content
              )}
            </YStack>

            <XStack className="gap-5 p-5 pt-0">
              {showCancel && (
                <Button
                  variant="tertiary"
                  className={cn(
                    'border-gray-20 h-[42px] flex-1 rounded-[30px] bg-transparent',
                    options?.cancelStyle?.toString() || ''
                  )}
                  onPress={cancel}
                  isDisabled={isLoading}>
                  <Button.Label>
                    <Text className="text-gray-80 text-[17px]">
                      {isLoading && shouldShowLoading ? t('common.loading') : cancelText}
                    </Text>
                  </Button.Label>
                </Button>
              )}
              <Button
                className={cn(
                  'h-[42px] flex-1 rounded-[30px] border',
                  confirmButtonClassName,
                  options?.confirmStyle?.toString() || ''
                )}
                onPress={confirm}
                isDisabled={isLoading}>
                <Button.Label>
                  <Text className={cn(confirmTextClassName, 'text-[17px]')}>
                    {isLoading && shouldShowLoading ? t('common.loading') : confirmText}
                  </Text>
                </Button.Label>
              </Button>
            </XStack>
          </YStack>
        </MotiView>
      </Modal>
    </DialogContext.Provider>
  )
}

export function useDialog() {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used within a DialogProvider')
  return ctx
}
