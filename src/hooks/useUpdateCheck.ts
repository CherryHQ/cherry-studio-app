import { useCallback, useEffect, useState } from 'react'

import { type UpdateInfo, updateService } from '@/services/UpdateService'
import { storage } from '@/utils'

const IGNORED_VERSION_KEY = 'update.ignored_version'

interface UseUpdateCheckResult {
  updateInfo: UpdateInfo
  isChecking: boolean
  isUpdating: boolean
  shouldShow: boolean
  checkForUpdate: () => Promise<void>
  downloadAndApply: () => Promise<void>
  ignoreCurrentVersion: () => void
}

/**
 * Hook for checking and managing app updates
 *
 * Automatically checks for updates on mount.
 * Once a version is ignored, it won't show again until a newer version is available.
 */
export function useUpdateCheck(): UseUpdateCheckResult {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>({
    isAvailable: false,
    isDownloaded: false
  })
  const [isChecking, setIsChecking] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [shouldShow, setShouldShow] = useState(false)

  const checkForUpdate = useCallback(async () => {
    setIsChecking(true)
    try {
      const info = await updateService.checkForUpdate()
      setUpdateInfo(info)

      if (info.isAvailable && info.manifest?.id) {
        const ignoredVersion = storage.getString(IGNORED_VERSION_KEY)
        // Only show if this version hasn't been ignored
        setShouldShow(ignoredVersion !== info.manifest.id)
      } else {
        setShouldShow(false)
      }
    } finally {
      setIsChecking(false)
    }
  }, [])

  const downloadAndApply = useCallback(async () => {
    setIsUpdating(true)
    try {
      await updateService.downloadAndApplyUpdate()
    } finally {
      setIsUpdating(false)
    }
  }, [])

  const ignoreCurrentVersion = useCallback(() => {
    if (updateInfo.manifest?.id) {
      storage.set(IGNORED_VERSION_KEY, updateInfo.manifest.id)
    }
    setShouldShow(false)
  }, [updateInfo.manifest?.id])

  // Check for updates on mount
  useEffect(() => {
    checkForUpdate()
  }, [checkForUpdate])

  return {
    updateInfo,
    isChecking,
    isUpdating,
    shouldShow,
    checkForUpdate,
    downloadAndApply,
    ignoreCurrentVersion
  }
}
