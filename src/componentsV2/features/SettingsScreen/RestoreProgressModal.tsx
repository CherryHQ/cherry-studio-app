import { CircleCheck, TriangleAlert, XCircle } from '@/componentsV2/icons/LucideIcon'
import { MotiView } from 'moti'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Pressable, View } from 'react-native'

import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { RestoreStepId, StepStatus } from '@/services/BackupService'
import { useTheme, Button, cn, ErrorView, Spinner } from 'heroui-native'
import Text from '@/componentsV2/base/Text'

export interface RestoreStep {
  id: RestoreStepId
  title: string
  status: StepStatus
  error?: string
}

interface RestoreProgressModalProps {
  isOpen: boolean
  steps: RestoreStep[]
  overallStatus: 'running' | 'success' | 'error'
  onClose: () => void
}

const getIconForStatus = (status: StepStatus) => {
  switch (status) {
    case 'in_progress':
      return <Spinner size="sm" className="text-text-link" />
    case 'completed':
      return <CircleCheck size={20} className="text-green-100 dark:text-green-dark-100" />
    case 'error':
      return <XCircle size={20} className="text-red-100 dark:text-red-100" />
    case 'pending':
    default:
      return <TriangleAlert size={20} className="text-orange-100 dark:text-orange-100" />
  }
}

export function RestoreProgressModal({ isOpen, steps, overallStatus, onClose }: RestoreProgressModalProps) {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const isDone = overallStatus === 'success' || overallStatus === 'error'
  const title =
    overallStatus === 'success'
      ? t('settings.data.restore.progress.success')
      : overallStatus === 'error'
        ? t('settings.data.restore.progress.error')
        : t('settings.data.restore.progress.pending')

  const description =
    overallStatus === 'success'
      ? t('settings.data.restore.progress.success_description')
      : overallStatus === 'error'
        ? t('settings.data.restore.progress.error_description')
        : t('settings.data.restore.progress.pending_description')

  return (
    <Modal
      animationType="fade"
      transparent
      visible={isOpen}
      onRequestClose={() => {
        if (isDone) onClose()
      }}>
      <MotiView
        from={{ opacity: 0, scale: 1.1 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: 'timing', duration: 300 }}
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: isDark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.4)'
        }}>
        {isDone && (
          <Pressable onPress={onClose} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
        )}
        <YStack className="w-3/4 gap-3 overflow-hidden rounded-2xl bg-ui-card-background p-4 dark:bg-ui-card-background-dark">
          <YStack className="items-center gap-3">
            <Text className="text-2xl font-bold">{title}</Text>
            <Text className="text-lg text-text-secondary dark:text-text-secondary-dark">{description}</Text>
          </YStack>

          <YStack className="items-center justify-center gap-3">
            {steps.map(step => (
              <ErrorView key={step.id} isInvalid={true}>
                <View className="flex-row items-center gap-2">
                  {getIconForStatus(step.status)}
                  <Text className="text-lg">{step.title}</Text>
                </View>
              </ErrorView>
            ))}
          </YStack>

          <XStack className="items-center justify-center">
            <Button
              size="sm"
              className={cn(
                'w-40 items-center justify-center rounded-[30px] border text-base',
                overallStatus === 'error'
                  ? 'border-red-20 bg-red-20 dark:border-red-20 dark:bg-red-20'
                  : overallStatus === 'success'
                    ? 'border-green-20 bg-green-20 dark:border-green-dark-20 dark:bg-green-dark-20'
                    : 'border-yellow-20 bg-yellow-20 dark:border-yellow-dark-20 dark:bg-yellow-dark-20'
              )}
              isDisabled={!isDone}
              onPress={onClose}>
              <Button.Label>
                <Text
                  className={cn(
                    overallStatus === 'error' && 'text-red-100 dark:text-red-100',
                    overallStatus === 'success' && 'text-green-100 dark:text-green-dark-100',
                    overallStatus === 'running' && 'text-yellow-100 dark:text-yellow-dark-100'
                  )}>
                  {isDone ? t('common.close') : t('settings.data.restore.progress.pending')}
                </Text>
              </Button.Label>
            </Button>
          </XStack>
        </YStack>
      </MotiView>
    </Modal>
  )
}
