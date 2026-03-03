import { cn } from 'heroui-native'
import { AnimatePresence, MotiView } from 'moti'
import React, { createContext, useContext, useEffect, useState } from 'react'
import { View } from 'react-native'

import Text from '@/componentsV2/base/Text'
import { uuid } from '@/utils'

export type ToastOptions = {
  key?: string
  content?: React.ReactNode | string
  icon?: React.ReactNode | string
  color?: string
  duration?: number
  expires?: number
}

type ToastContextValue = { show: (content: React.ReactNode | string, options?: ToastOptions) => void } | undefined

const ToastContext = createContext<ToastContextValue>(undefined)

const DEFAULT_DURATION = 1500

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastOptions[]>([])

  const centeredViewClassName = 'justify-center items-center'

  const show = (content: React.ReactNode | string, newOptions?: ToastOptions) => {
    const key = uuid()
    const now = Date.now()
    const duration = newOptions?.duration ?? DEFAULT_DURATION
    const expires = now + duration
    setToasts(prev => [
      // 延长旧的 toast 的过期时间，避免新 toast 覆盖旧的 toast 导致看不见
      ...prev.map(toast => ({ ...toast, expires: (toast.expires || 0) + duration })),
      { content, ...newOptions, key, expires }
    ])
  }

  const removeExpiredToasts = () => {
    const now = Date.now()
    setToasts(prev => prev.filter(toast => toast.expires && toast.expires > now))
  }

  useEffect(() => {
    const animationFrameId = requestAnimationFrame(removeExpiredToasts)

    if (toasts.length === 0) {
      cancelAnimationFrame(animationFrameId)
    }

    return () => cancelAnimationFrame(animationFrameId)
  }, [toasts])

  const api = { show }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <View className={cn('absolute inset-0 rounded-lg', centeredViewClassName)}>
        <AnimatePresence>
          {toasts.map(toast => (
            <MotiView
              key={toast.key}
              from={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'timing', duration: 200 }}
              className="absolute max-w-[80%] items-center justify-center gap-2.5 rounded-lg bg-gray-800 px-5 py-2.5 shadow-lg">
              {toast.icon && toast.icon}

              {typeof toast?.content === 'string' ? (
                <Text className={cn('text-base', toast.color || 'text-white')}>{toast.content}</Text>
              ) : (
                toast?.content
              )}
            </MotiView>
          ))}
        </AnimatePresence>
      </View>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
