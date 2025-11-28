import { Platform } from 'react-native'

/**
 * App update configuration
 */
export const UPDATE_CONFIG = {
  /** GitHub repository owner */
  GITHUB_OWNER: 'CherryHQ',
  /** GitHub repository name */
  GITHUB_REPO: 'cherry-studio-app',
  /** GitHub API URL for latest release */
  GITHUB_API_URL: 'https://api.github.com/repos/CherryHQ/cherry-studio-app/releases/latest',
  /** GitHub releases page URL (for Android) */
  GITHUB_RELEASES_URL: 'https://github.com/CherryHQ/cherry-studio-app/releases/latest'
} as const

/**
 * Check if the current platform supports direct update link
 * iOS: No direct link (user should check TestFlight manually)
 * Android: Can open GitHub releases
 */
export function hasUpdateUrl(): boolean {
  return Platform.OS === 'android'
}

/**
 * Get the update URL (only for Android)
 */
export function getUpdateUrl(): string {
  return UPDATE_CONFIG.GITHUB_RELEASES_URL
}
