import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, BottomSheetView } from '@gorhom/bottom-sheet'
import React, { forwardRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, BackHandler } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import Text from '@/componentsV2/base/Text'
import { CircleCheck, RefreshCw, XCircle } from '@/componentsV2/icons/LucideIcon'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useTheme } from '@/hooks/useTheme'
import { loggerService } from '@/services/LoggerService'
import { modelHealthService } from '@/services/ModelHealthService'
import type { Model, ModelHealth, Provider } from '@/types/assistant'

const logger = loggerService.withContext('ModelHealthCheckSheet')

interface ModelHealthCheckSheetProps {
  provider?: Provider
  models: Model[]
}

export const ModelHealthCheckSheet = forwardRef<BottomSheetModal, ModelHealthCheckSheetProps>(
  ({ provider, models }, ref) => {
    const { t } = useTranslation()
    const { isDark } = useTheme()

    const [isVisible, setIsVisible] = useState(false)
    const [healthResults, setHealthResults] = useState<Record<string, ModelHealth>>({})
    const [isChecking, setIsChecking] = useState(false)
    const insets = useSafeAreaInsets()

    const startHealthCheck = async () => {
      if (!provider) return

      setIsChecking(true)

      // Initialize all models as idle/testing
      const initialResults: Record<string, ModelHealth> = {}
      models.forEach(model => {
        initialResults[model.id] = {
          modelId: model.id,
          status: 'testing'
        }
      })
      setHealthResults(initialResults)

      try {
        // Check models one by one to show progress
        for (const model of models) {
          try {
            const result = await modelHealthService.checkModelHealth(provider, model)
            setHealthResults(prev => ({
              ...prev,
              [model.id]: result
            }))
          } catch (error) {
            logger.error(`Failed to check model ${model.id}:`, error as Error)
            setHealthResults(prev => ({
              ...prev,
              [model.id]: {
                modelId: model.id,
                status: 'unhealthy',
                error: error instanceof Error ? error.message : 'Unknown error'
              }
            }))
          }
        }
      } finally {
        setIsChecking(false)
      }
    }

    useEffect(() => {
      if (!isVisible) return

      const backAction = () => {
        ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
        return true
      }

      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
      return () => backHandler.remove()
    }, [ref, isVisible])

    useEffect(() => {
      if (isVisible && provider && models.length > 0) {
        startHealthCheck()
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isVisible, provider, models])

    const renderBackdrop = (props: any) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />
    )

    const getStatusIcon = (status: ModelHealth['status']) => {
      switch (status) {
        case 'healthy':
          return <CircleCheck size={16} className="text-green-500" />
        case 'unhealthy':
          return <XCircle size={16} className="text-red-500" />
        case 'testing':
          return <ActivityIndicator size="small" color={isDark ? '#ffffff' : '#000000'} />
        default:
          return null
      }
    }

    return (
      <BottomSheetModal
        enableDynamicSizing={false}
        snapPoints={['80%']}
        ref={ref}
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
        <BottomSheetView style={{ flex: 1, paddingBottom: insets.bottom }}>
          <YStack className="flex-1 gap-4 px-5 pb-7">
            <XStack className="w-full items-center justify-between px-3">
              <Text className="text-xl font-semibold">{t('settings.models.health_check.title')}</Text>
              {isChecking && (
                <XStack className="items-center gap-2">
                  <RefreshCw size={16} className="text-text-secondary animate-spin" />
                  <Text className="text-text-secondary text-sm">{t('settings.models.health_check.checking')}</Text>
                </XStack>
              )}
            </XStack>

            <BottomSheetScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              <YStack className="gap-2">
                {models.map(model => {
                  const health = healthResults[model.id]
                  const latencyText = health?.latency != null ? `${health.latency.toFixed(2)}s` : '-'

                  return (
                    <XStack
                      key={model.id}
                      className="border-border bg-background-secondary w-full items-center justify-between rounded-2xl border px-4 py-3">
                      <YStack className="flex-1 gap-1">
                        <Text className="text-sm font-medium" numberOfLines={1}>
                          {model.name || model.id}
                        </Text>
                        {health?.error && (
                          <Text className="text-xs text-red-500" numberOfLines={2}>
                            {health.error}
                          </Text>
                        )}
                      </YStack>

                      <XStack className="items-center gap-3">
                        <Text className="text-text-secondary min-w-[60px] text-right font-mono text-sm">
                          {latencyText}
                        </Text>
                        {health && getStatusIcon(health.status)}
                      </XStack>
                    </XStack>
                  )
                })}
              </YStack>
            </BottomSheetScrollView>
          </YStack>
        </BottomSheetView>
      </BottomSheetModal>
    )
  }
)

ModelHealthCheckSheet.displayName = 'ModelHealthCheckSheet'
