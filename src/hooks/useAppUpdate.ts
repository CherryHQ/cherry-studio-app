import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { hasUpdateUrl } from '@/config/update'
import { useDialog } from '@/hooks/useDialog'
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
 * }, [])
 * ```
 */
export function useAppUpdate() {
  const { t } = useTranslation()
  const dialog = useDialog()
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
          dialog.open({
            type: 'info',
            title: t('update.new_version_available'),
            content: t('update.new_version_content', { version: result.latestVersion }),
            confirmText: t('update.update_now'),
            cancelText: t('update.later'),
            onConFirm: () => {
              appUpdateService.openUpdatePage()
            },
            onCancel: () => {
              preferenceService.set('app.dismissed_update_version', result.latestVersion)
            }
          })
        } else {
          // iOS: Just notify, user should check TestFlight manually
          dialog.open({
            type: 'info',
            title: t('update.new_version_available'),
            content: t('update.new_version_content_ios', { version: result.latestVersion }),
            confirmText: t('update.got_it'),
            showCancel: false,
            onConFirm: () => {
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
  }, [dialog, t])

  return { checkUpdate }
}
