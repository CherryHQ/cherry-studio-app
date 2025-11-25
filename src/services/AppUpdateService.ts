import Constants from 'expo-constants'
import * as Linking from 'expo-linking'

import { getUpdateUrl, UPDATE_CONFIG } from '@/config/update'
import { loggerService } from '@/services/LoggerService'

const logger = loggerService.withContext('AppUpdateService')

/**
 * Result of checking for app updates
 */
export interface UpdateCheckResult {
  /** Whether a new version is available */
  hasUpdate: boolean
  /** Latest version from GitHub */
  latestVersion: string
  /** Current app version */
  currentVersion: string
  /** URL to the release page */
  releaseUrl: string
  /** Release notes (body from GitHub release) */
  releaseNotes?: string
}

/**
 * GitHub release response type
 */
interface GitHubRelease {
  tag_name: string
  html_url: string
  body?: string
  name?: string
}

/**
 * Service for handling app updates
 */
export class AppUpdateService {
  private static instance: AppUpdateService

  private constructor() {}

  public static getInstance(): AppUpdateService {
    if (!AppUpdateService.instance) {
      AppUpdateService.instance = new AppUpdateService()
    }
    return AppUpdateService.instance
  }

  /**
   * Compare two semantic version strings
   * @param v1 First version (e.g., "1.2.3")
   * @param v2 Second version (e.g., "1.2.4")
   * @returns positive if v1 > v2, negative if v1 < v2, 0 if equal
   */
  public compareVersions(v1: string, v2: string): number {
    // Remove 'v' prefix if present
    const normalize = (v: string) => v.replace(/^v/, '')
    const parts1 = normalize(v1).split('.').map(Number)
    const parts2 = normalize(v2).split('.').map(Number)

    // Ensure both arrays have the same length
    const maxLength = Math.max(parts1.length, parts2.length)
    while (parts1.length < maxLength) parts1.push(0)
    while (parts2.length < maxLength) parts2.push(0)

    for (let i = 0; i < maxLength; i++) {
      const diff = parts1[i] - parts2[i]
      if (diff !== 0) return diff
    }
    return 0
  }

  /**
   * Check for app updates by fetching the latest release from GitHub
   * @returns UpdateCheckResult with update information
   */
  public async checkForUpdate(): Promise<UpdateCheckResult> {
    const currentVersion = Constants.expoConfig?.version || '0.0.0'

    logger.info('Checking for updates', { currentVersion })

    const response = await fetch(UPDATE_CONFIG.GITHUB_API_URL, {
      headers: {
        Accept: 'application/vnd.github.v3+json'
      }
    })

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
    }

    const release: GitHubRelease = await response.json()
    const latestVersion = release.tag_name.replace(/^v/, '')
    const hasUpdate = this.compareVersions(latestVersion, currentVersion) > 0

    logger.info('Update check completed', {
      currentVersion,
      latestVersion,
      hasUpdate
    })

    return {
      hasUpdate,
      latestVersion,
      currentVersion,
      releaseUrl: release.html_url,
      releaseNotes: release.body
    }
  }

  /**
   * Open the appropriate update page based on platform
   * iOS: Opens TestFlight
   * Android: Opens GitHub releases
   */
  public async openUpdatePage(): Promise<void> {
    const url = getUpdateUrl()
    logger.info('Opening update page', { url })

    try {
      const canOpen = await Linking.canOpenURL(url)
      if (canOpen) {
        await Linking.openURL(url)
      } else {
        logger.warn('Cannot open update URL', { url })
      }
    } catch (error) {
      logger.error('Failed to open update page', error as Error)
    }
  }
}

export const appUpdateService = AppUpdateService.getInstance()
