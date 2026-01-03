import { Button, cn } from 'heroui-native'
import { MotiView } from 'moti'
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Pressable } from 'react-native'

import Text from '@/componentsV2/base/Text'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useTheme } from '@/hooks/useTheme'
import { loggerService } from '@/services/LoggerService'

const logger = loggerService.withContext('useDialog')

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
  closeOnConfirm?: boolean
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

  const close = useCallback(() => {
    setOpen(false)
    setTimeout(() => {
      setOptions(null)
    }, 300)
  }, [])

  const cancel = async () => {
    if (isLoading) return

    try {
      await options?.onCancel?.()
    } catch (error) {
      logger.error('Dialog onCancel error', error as Error)
    }
    close()
  }

  const confirm = async () => {
    if (isLoading) return

    const shouldCloseOnConfirm = options?.closeOnConfirm ?? true

    if (options?.showLoading) {
      setIsLoading(true)
    }

    try {
      await options?.onConFirm?.()
    } catch (error) {
      logger.error('Dialog onConfirm error', error as Error)
    } finally {
      setIsLoading(false)
      if (shouldCloseOnConfirm) {
        close()
      }
    }
  }

  const open = useCallback((newOptions: DialogOptions) => {
    setOptions(newOptions)
    setIsLoading(false)
    setOpen(true)
  }, [])

  const getConfirmButtonClassName = () => {
    switch (options?.type) {
      case 'info':
        return 'bg-sky-500/20 border-sky-500/20 active:opacity-80 active:bg-sky-500/20'
      case 'warning':
        return 'bg-orange-400/20 border-orange-400/20 active:opacity-80 active:bg-orange-400/20'
      case 'error':
        return 'bg-red-600/20 border-red-600/20 active:opacity-80 active:bg-red-600/20'
      case 'success':
        return 'primary-container active:opacity-80'
      default:
        return 'primary-container active:opacity-80'
    }
  }

  const getConfirmTextClassName = () => {
    switch (options?.type) {
      case 'info':
        return 'text-sky-500'
      case 'warning':
        return 'text-orange-400'
      case 'error':
        return 'text-red-600'
      case 'success':
        return 'primary-text'
      default:
        return 'primary-text'
    }
  }

  const api = useMemo(() => ({ open, close }), [open, close])

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
          <YStack className="bg-card w-3/4 rounded-2xl">
            <YStack className="items-center gap-3 p-5">
              {typeof options?.title === 'string' ? (
                <Text className="text-foreground text-lg font-bold">{options.title}</Text>
              ) : (
                options?.title
              )}
              {typeof options?.content === 'string' ? (
                <Text className="text-foreground-secondary text-center text-[15px] leading-5">{options.content}</Text>
              ) : (
                options?.content
              )}
            </YStack>

            <XStack className="gap-5 p-5 pt-0">
              {showCancel && (
                <Button
                  pressableFeedbackVariant="ripple"
                  variant="tertiary"
                  className={cn(
                    'h-[42px] flex-1 rounded-[30px] border border-zinc-400/20 bg-transparent active:opacity-80',
                    options?.cancelStyle?.toString() || ''
                  )}
                  onPress={cancel}
                  isDisabled={isLoading}>
                  <Button.Label>
                    <Text className="text-[17px] text-zinc-600/80">
                      {isLoading && shouldShowLoading ? t('common.loading') : cancelText}
                    </Text>
                  </Button.Label>
                </Button>
              )}
              <Button
                pressableFeedbackVariant="ripple"
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
