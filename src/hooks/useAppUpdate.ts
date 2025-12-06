import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { presentDialog } from '@/componentsV2'
import { hasUpdateUrl } from '@/config/update'
import { appUpdateService } from '@/services/AppUpdateService'
import { loggerService } from '@/services/LoggerService'
import { preferenceService } from '@/services/PreferenceService'

const logger = loggerService.withContext('useAppUpdate')

/**
 * Hook for checking app updates and showing update dialog
 *
 * Usage:
 * ```tsx
 * const { checkUpdate } = useAppUpdate()
 *
 * useEffect(() => {
 *   checkUpdate()
 * }, [checkUpdate])
 * ```
 */
export function useAppUpdate() {
  const { t } = useTranslation()
  const isCheckingRef = useRef(false)

  const checkUpdate = useCallback(async () => {
    // Prevent multiple concurrent checks
    if (isCheckingRef.current) {
      return
    }

    // Skip update check in development mode
    if (__DEV__) {
      logger.info('Skipping update check in development mode')
      return
    }

    isCheckingRef.current = true

    try {
      const result = await appUpdateService.checkForUpdate()

      if (result.hasUpdate) {
        logger.info('New version available', {
          current: result.currentVersion,
          latest: result.latestVersion
        })

        // Check if this version was previously dismissed by user
        const dismissedVersion = await preferenceService.get('app.dismissed_update_version')
        if (dismissedVersion === result.latestVersion) {
          logger.info('Update dismissed by user, skipping', { version: result.latestVersion })
          return
        }

        // iOS: Only show notification (no direct link)
        // Android: Show update button with link to GitHub releases
        if (hasUpdateUrl()) {
          presentDialog('info', {
            title: t('update.new_version_available'),
            content: t('update.new_version_content', { version: result.latestVersion }),
            confirmText: t('update.update_now'),
            showCancel: true,
            cancelText: t('update.later'),
            onConfirm: () => {
              appUpdateService.openUpdatePage()
            },
            onCancel: () => {
              preferenceService.set('app.dismissed_update_version', result.latestVersion)
            }
          })
        } else {
          // iOS: Just notify, user should check TestFlight manually
          presentDialog('info', {
            title: t('update.new_version_available'),
            content: t('update.new_version_content_ios', { version: result.latestVersion }),
            confirmText: t('update.got_it'),
            onConfirm: () => {
              preferenceService.set('app.dismissed_update_version', result.latestVersion)
            }
          })
        }
      } else {
        logger.info('App is up to date', {
          version: result.currentVersion
        })
      }
    } catch (error) {
      // Silent failure - don't affect user experience
      logger.warn('Failed to check for update', error as Error)
    } finally {
      isCheckingRef.current = false
    }
  }, [t])

  return { checkUpdate }
}
