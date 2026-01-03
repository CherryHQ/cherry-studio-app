import * as Updates from 'expo-updates'

import { loggerService } from './LoggerService'

const logger = loggerService.withContext('UpdateService')

export interface UpdateInfo {
  isAvailable: boolean
  isDownloaded: boolean
  manifest?: Updates.Manifest
}

class UpdateService {
  private _updateInfo: UpdateInfo = {
    isAvailable: false,
    isDownloaded: false
  }

  /**
   * Check if there's a new update available
   * Returns update info with availability status
   */
  async checkForUpdate(): Promise<UpdateInfo> {
    // Skip in development mode or when updates are not available
    if (__DEV__ || !Updates.isEnabled) {
      logger.info('Updates are disabled in development mode')
      return this._updateInfo
    }

    try {
      logger.info('Checking for updates...')
      const update = await Updates.checkForUpdateAsync()

      if (update.isAvailable) {
        logger.info('Update available', { manifest: update.manifest })
        this._updateInfo = {
          isAvailable: true,
          isDownloaded: false,
          manifest: update.manifest
        }
      } else {
        logger.info('No updates available')
        this._updateInfo = {
          isAvailable: false,
          isDownloaded: false
        }
      }

      return this._updateInfo
    } catch (error) {
      logger.error('Failed to check for updates', error as Error)
      return this._updateInfo
    }
  }

  /**
   * Download the available update
   */
  async downloadUpdate(): Promise<boolean> {
    if (!this._updateInfo.isAvailable) {
      logger.warn('No update available to download')
      return false
    }

    try {
      logger.info('Downloading update...')
      await Updates.fetchUpdateAsync()
      this._updateInfo.isDownloaded = true
      logger.info('Update downloaded successfully')
      return true
    } catch (error) {
      logger.error('Failed to download update', error as Error)
      return false
    }
  }

  /**
   * Apply the downloaded update by reloading the app
   */
  async applyUpdate(): Promise<void> {
    if (!this._updateInfo.isDownloaded) {
      logger.warn('No downloaded update to apply')
      return
    }

    try {
      logger.info('Applying update and reloading app...')
      await Updates.reloadAsync()
    } catch (error) {
      logger.error('Failed to apply update', error as Error)
    }
  }

  /**
   * Download and apply update in one step
   */
  async downloadAndApplyUpdate(): Promise<void> {
    const downloaded = await this.downloadUpdate()
    if (downloaded) {
      await this.applyUpdate()
    }
  }

  get updateInfo(): UpdateInfo {
    return this._updateInfo
  }
}

export const updateService = new UpdateService()
