import * as Linking from 'expo-linking'
import { Platform } from 'react-native'

import { loggerService } from '@/services/LoggerService'

const logger = loggerService.withContext('ShortcutCallbackManager')

/**
 * Callback data structure for pending shortcut executions
 */
interface PendingCallback {
  resolve: (result: ShortcutResult) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

/**
 * Result returned from a shortcut execution
 */
export interface ShortcutResult {
  success: boolean
  result?: string
  error?: string
  cancelled?: boolean
}

/**
 * Singleton manager for handling iOS Shortcuts x-callback-url responses
 * Manages pending promises and URL event listeners
 */
class ShortcutCallbackManagerClass {
  private pendingCallbacks = new Map<string, PendingCallback>()
  private isListenerRegistered = false
  private static instance: ShortcutCallbackManagerClass | null = null

  /**
   * Get singleton instance
   */
  static getInstance(): ShortcutCallbackManagerClass {
    if (!ShortcutCallbackManagerClass.instance) {
      ShortcutCallbackManagerClass.instance = new ShortcutCallbackManagerClass()
    }
    return ShortcutCallbackManagerClass.instance
  }

  /**
   * Initialize the URL listener for handling callbacks
   * Should be called once during app startup
   */
  async initializeListener() {
    if (this.isListenerRegistered || Platform.OS !== 'ios') {
      return
    }

    Linking.addEventListener('url', event => {
      this.handleCallback(event.url)
    })

    this.isListenerRegistered = true

    // Check for initial URL (Cold Start)
    try {
      const initialUrl = await Linking.getInitialURL()
      if (initialUrl) {
        this.handleCallback(initialUrl)
      }
    } catch (err) {
      logger.error('Error checking initial URL', err as Error)
    }
  }

  /**
   * Parse callback URL and resolve/reject the corresponding promise
   */
  private handleCallback(url: string) {
    try {
      const parsed = Linking.parse(url)

      // Check if this is a shortcut callback URL
      if (parsed.path !== 'shortcut-callback') {
        return
      }

      const { id, result, error, cancelled } = parsed.queryParams || {}

      if (!id || typeof id !== 'string') {
        return
      }

      const callback = this.pendingCallbacks.get(id)
      if (!callback) {
        return
      }

      // Clear timeout
      clearTimeout(callback.timeout)
      this.pendingCallbacks.delete(id)

      // Resolve or reject based on callback type
      if (error) {
        callback.reject(new Error(typeof error === 'string' ? error : 'Shortcut execution failed'))
      } else if (cancelled === 'true') {
        callback.resolve({
          success: false,
          cancelled: true
        })
      } else {
        callback.resolve({
          success: true,
          result: typeof result === 'string' ? result : undefined
        })
      }
    } catch (err) {
      logger.error('Error handling shortcut callback', err as Error)
    }
  }

  /**
   * Register a new pending callback
   * Returns a promise that resolves when the callback URL is triggered
   */
  registerCallback(callbackId: string, timeoutMs: number = 30000): Promise<ShortcutResult> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCallbacks.delete(callbackId)
        reject(new Error('Shortcut execution timeout'))
      }, timeoutMs)

      this.pendingCallbacks.set(callbackId, {
        resolve,
        reject,
        timeout
      })
    })
  }

  /**
   * Cancel a pending callback
   */
  cancelCallback(callbackId: string) {
    const callback = this.pendingCallbacks.get(callbackId)
    if (callback) {
      clearTimeout(callback.timeout)
      this.pendingCallbacks.delete(callbackId)
      callback.reject(new Error('Callback cancelled'))
    }
  }

  /**
   * Clear all pending callbacks
   */
  clearAll() {
    this.pendingCallbacks.forEach(callback => {
      clearTimeout(callback.timeout)
      callback.reject(new Error('All callbacks cleared'))
    })
    this.pendingCallbacks.clear()
  }
}

/**
 * Export singleton instance
 */
export const ShortcutCallbackManager = ShortcutCallbackManagerClass.getInstance()
