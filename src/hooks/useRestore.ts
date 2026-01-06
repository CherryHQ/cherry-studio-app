import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDispatch } from 'react-redux'

import { presentDialog } from '@/componentsV2'
import type { RestoreStep } from '@/componentsV2/features/SettingsScreen/data/RestoreProgressModal'
import { databaseMaintenance } from '@/database/DatabaseMaintenance'
import { resetAppInitializationState, runAppDataMigrations } from '@/services/AppInitializationService'
import type { ProgressUpdate, RestoreStepId, StepStatus } from '@/services/BackupService'
import { restore } from '@/services/BackupService'
import { loggerService } from '@/services/LoggerService'
import type { FileMetadata } from '@/types/file'
import { uuid } from '@/utils'
import { getFileExtension, getFileType } from '@/utils/file'
const logger = loggerService.withContext('useRestore')

// 定义步骤配置类型
export interface StepConfig {
  id: RestoreStepId
  titleKey: string
}

// 预定义的步骤配置
export const RESTORE_STEP_CONFIGS = {
  CLEAR_DATA: {
    id: 'clear_data' as RestoreStepId,
    titleKey: 'settings.data.restore.steps.clear_data'
  },
  RECEIVE_FILE: {
    id: 'receive_file' as RestoreStepId,
    titleKey: 'settings.data.restore.steps.receive_file'
  },
  RESTORE_SETTINGS: {
    id: 'restore_settings' as RestoreStepId,
    titleKey: 'settings.data.restore.steps.restore_settings'
  },
  RESTORE_MESSAGES: {
    id: 'restore_messages' as RestoreStepId,
    titleKey: 'settings.data.restore.steps.restore_messages'
  }
} as const

// 预定义的步骤组合
export const DEFAULT_RESTORE_STEPS: StepConfig[] = [
  RESTORE_STEP_CONFIGS.RESTORE_SETTINGS,
  RESTORE_STEP_CONFIGS.RESTORE_MESSAGES
]

// LAN 传输步骤组合（包含文件接收）
export const LAN_RESTORE_STEPS: StepConfig[] = [
  RESTORE_STEP_CONFIGS.RECEIVE_FILE,
  RESTORE_STEP_CONFIGS.RESTORE_SETTINGS,
  RESTORE_STEP_CONFIGS.RESTORE_MESSAGES
]

// LAN 传输步骤组合（包含清理和文件接收）
export const LAN_RESTORE_STEPS_WITH_CLEAR: StepConfig[] = [
  RESTORE_STEP_CONFIGS.CLEAR_DATA,
  RESTORE_STEP_CONFIGS.RESTORE_SETTINGS,
  RESTORE_STEP_CONFIGS.RESTORE_MESSAGES
]

const createStepsFromConfig = (stepConfigs: StepConfig[], t: (key: string) => string): RestoreStep[] => {
  return stepConfigs.map(config => ({
    id: config.id,
    title: t(config.titleKey),
    status: 'pending' as const
  }))
}

export interface UseRestoreOptions {
  stepConfigs?: StepConfig[]
  clearBeforeRestore?: boolean
  customRestoreFunction?: (
    file: Omit<FileMetadata, 'md5'>,
    onProgress: (update: ProgressUpdate) => void
  ) => Promise<void>
}

export function useRestore(options: UseRestoreOptions = {}) {
  const { t } = useTranslation()
  const dispatch = useDispatch()

  const { stepConfigs = DEFAULT_RESTORE_STEPS, clearBeforeRestore = false, customRestoreFunction = restore } = options

  const [isModalOpen, setModalOpen] = useState(false)
  const [restoreSteps, setRestoreSteps] = useState<RestoreStep[]>(createStepsFromConfig(stepConfigs, t))
  const [overallStatus, setOverallStatus] = useState<'running' | 'success' | 'error'>('running')

  const validateFile = (file: { mimeType?: string; name: string; type?: string }) => {
    const isValid = file.name.includes('cherry-studio')

    if (!isValid) {
      presentDialog('error', {
        title: t('error.backup.title'),
        content: t('error.backup.file_invalid')
      })
      return false
    }

    return true
  }

  const createFileObject = (file: {
    name: string
    uri: string
    size?: number
    mimeType?: string
    type?: string
  }): Omit<FileMetadata, 'md5'> => {
    const ext = getFileExtension(file.name)

    return {
      id: uuid(),
      name: file.name,
      origin_name: file.name,
      path: file.uri,
      size: file.size || 0,
      ext,
      type: getFileType(ext),
      created_at: Date.now(),
      count: 1
    }
  }

  const handleProgressUpdate = (update: ProgressUpdate) => {
    logger.info('handleProgressUpdate called:', update.step, update.status)
    setRestoreSteps(prevSteps => {
      const newSteps = prevSteps.map(step =>
        step.id === update.step ? { ...step, status: update.status, error: update.error } : step
      )
      logger.info('State updated for step:', update.step, 'new status:', update.status)
      return newSteps
    })
  }

  const handleError = () => {
    setOverallStatus('error')
    setRestoreSteps(prevSteps => {
      const errorStepIndex = prevSteps.findIndex(step => step.status === 'in_progress')

      if (errorStepIndex > -1) {
        const newSteps = [...prevSteps]
        newSteps[errorStepIndex] = { ...newSteps[errorStepIndex], status: 'error' }
        return newSteps
      }

      return prevSteps
    })
  }

  const startRestore = async (
    file: { name: string; uri: string; size?: number; mimeType?: string },
    skipModalSetup = false
  ) => {
    if (!validateFile(file)) return

    // 重置状态并打开模态框（除非 skipModalSetup 为 true）
    // 先显示 modal，然后在 setTimeout 中执行清理和恢复操作
    if (!skipModalSetup) {
      setRestoreSteps(createStepsFromConfig(stepConfigs, t))
      setOverallStatus('running')
      setModalOpen(true)
    }

    // Use setTimeout to ensure the modal renders before starting the restore process
    setTimeout(async () => {
      try {
        // 清除现有数据（如果启用）
        // 流程：重置数据库 -> 运行 v1 seed -> 恢复备份数据 -> restore() 内部运行增量迁移
        if (clearBeforeRestore) {
          try {
            updateStepStatus('clear_data', 'in_progress')
            logger.info('Clearing existing data before restore...')
            await databaseMaintenance.resetDatabase()
            resetAppInitializationState()
            // 运行迁移以初始化系统数据（v1 seed）
            // restore() 会在恢复后根据备份版本运行增量迁移
            await runAppDataMigrations()
            logger.info('Existing data cleared successfully')
            updateStepStatus('clear_data', 'completed')
          } catch (error) {
            logger.error('Failed to clear existing data:', error)
            updateStepStatus('clear_data', 'error', String(error))
            setOverallStatus('error')
            return
          }
        }

        const fileObject = createFileObject(file)
        await customRestoreFunction(fileObject, handleProgressUpdate, dispatch)
        setOverallStatus('success')
      } catch (err) {
        logger.error('Error during restore process:', err)
        handleError()
      }
    }, 400)
  }

  const updateStepStatus = (stepId: RestoreStepId, status: StepStatus, error?: string) => {
    setRestoreSteps(prevSteps => prevSteps.map(step => (step.id === stepId ? { ...step, status, error } : step)))
  }

  const openModal = () => {
    setRestoreSteps(createStepsFromConfig(stepConfigs, t))
    setOverallStatus('running')
    setModalOpen(true)
  }

  return {
    isModalOpen,
    restoreSteps,
    overallStatus,
    startRestore,
    closeModal: () => setModalOpen(false),
    updateStepStatus,
    openModal
  }
}
